import * as path from "node:path";

/**
 * Identifies a local template file that needs to be mounted into the
 * container. Distinguishes a real path from a bare-name like `eisvogel`.
 */
export interface LocalTemplate {
  absolutePath: string;
}

export interface BuildPandocCommandOptions {
  /** Absolute host path to the intermediate Markdown file. */
  mdPath: string;
  /** Absolute host path to the generated `.bib` file. */
  bibPath: string;
  /** Absolute host path where pandoc should write the PDF. */
  pdfPath: string;
  /** Absolute host path to the CSL file (optional). */
  cslPath?: string;
  /**
   * Either a {@link LocalTemplate} (mounted file) or a bare string passed
   * straight to pandoc (resolved from its data dir, e.g. `eisvogel`).
   */
  template?: string | LocalTemplate;
  /** Include `--toc` if true. */
  toc?: boolean;
  /** `-V key=value` forwarded to pandoc. */
  extraVars?: string[];
  /** Vault root used as the primary `/vault` mount. */
  vaultPath: string;
  /**
   * Whether to include `--citeproc` and `--bibliography`. Defaults true.
   * The runner sets this to `false` for the citeproc-failure fallback.
   */
  withCiteproc?: boolean;
}

/**
 * Pure command builder: produce the argv array for a docker invocation that
 * runs pandoc/extra over the given inputs.
 *
 * Mirrors the path-translation and flag-assembly behaviour of `run_pandoc`
 * (vault_passport.py:490-583) without spawning anything. Side-effect-free,
 * fully testable.
 *
 * Files inside `vaultPath` are accessed as `/vault/<relative-path>` inside
 * the container. Files outside the vault get their parent directory mounted
 * read-only at a unique `/ext0`, `/ext1`, … prefix.
 */
export function buildPandocCommand(options: BuildPandocCommandOptions): string[] {
  const {
    mdPath,
    bibPath,
    pdfPath,
    cslPath,
    template,
    toc = false,
    extraVars,
    vaultPath,
    withCiteproc = true,
  } = options;

  const mountRoot = path.resolve(vaultPath);
  const extraMounts = new Map<string, string>(); // host dir → /extN
  let nextExt = 0;

  const toContainer = (hostPath: string): string => {
    const abs = path.resolve(hostPath);
    const rel = path.relative(mountRoot, abs);
    if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
      // posix-style path inside the container regardless of host OS
      const posix = rel.split(path.sep).join("/");
      return `/vault/${posix}`;
    }
    // Outside the vault — register an extra mount for the parent dir
    const dir = path.dirname(abs);
    let prefix = extraMounts.get(dir);
    if (!prefix) {
      prefix = `/ext${nextExt++}`;
      extraMounts.set(dir, prefix);
    }
    return `${prefix}/${path.basename(abs)}`;
  };

  // Translate the three core paths first (md/pdf/bib), so the primary mount
  // is always present and any `/extN` registrations happen before we render
  // the volume-args slice.
  const containerMd = toContainer(mdPath);
  const containerPdf = toContainer(pdfPath);
  const containerBib = toContainer(bibPath);

  const flags: string[] = [];
  if (cslPath) flags.push(`--csl=${toContainer(cslPath)}`);
  if (toc) flags.push("--toc");
  if (template !== undefined) {
    if (typeof template === "string") {
      flags.push(`--template=${template}`);
    } else {
      flags.push(`--template=${toContainer(template.absolutePath)}`);
    }
  }
  if (extraVars) {
    for (const v of extraVars) {
      flags.push("-V", v);
    }
  }
  // Default xelatex unless caller overrides via extraVars
  const hasPdfEngine = extraVars?.some((v) => v.startsWith("pdf-engine=")) ?? false;
  if (!hasPdfEngine) flags.push("--pdf-engine=xelatex");

  // Citeproc bits go last so the test for citeproc-fallback variant is a
  // simple "drop two flags" comparison.
  if (withCiteproc) {
    flags.push("--citeproc", `--bibliography=${containerBib}`);
  }

  // Volume args
  const volumeArgs: string[] = ["-v", `${mountRoot}:/vault`];
  for (const [host, prefix] of extraMounts) {
    volumeArgs.push("-v", `${host}:${prefix}:ro`);
  }

  return [
    "docker",
    "run",
    "--rm",
    ...volumeArgs,
    "pandoc/extra",
    containerMd,
    "-o",
    containerPdf,
    ...flags,
  ];
}
