import GUI from "lil-gui";
import { DottedGrid, type GridConfig } from "./grid.ts";
import gridSource from "./grid.ts?raw";

const SITE_PALETTE = [
  "#1E3AFF", // cobalt
  "#FF4D1F", // orange
  "#E5142A", // red
  "#FF3DA1", // pink
  "#FFC400", // yellow
  "#7A2BFF", // purple
  "#7CFF1F", // lime
];

const STORAGE_KEY = "dotted-grid-config@v1";

const defaults: GridConfig = {
  bgColor: "#F4F4F4",
  dotColor: "#B8B8B8",
  palette: [...SITE_PALETTE],
  sectionsX: 8,
  sectionsY: 8,
  renderMode: "lines",
  dotSize: 0.5,
  spacing: 26,
  cursorRadius: 21,
  cursorStrength: 3.4,
  pullRestDelay: 0.1,
  colorRadius: 357,
  scrollStrength: 0.6,
  springStiffness: 0.01,
  damping: 0.82,
  paused: false,
};

function loadSavedConfig(): Partial<GridConfig> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.palette && (!Array.isArray(parsed.palette) || parsed.palette.length < 1)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const saved = loadSavedConfig();
const config: GridConfig = {
  ...defaults,
  ...(saved ?? {}),
  palette: saved?.palette ? [...saved.palette] : [...defaults.palette],
  paused: false,
};

let saveTimer: number | null = null;
function saveConfig() {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // localStorage may be disabled or full; silently no-op
    }
    saveTimer = null;
  }, 250);
}

const canvas = document.getElementById("bg") as HTMLCanvasElement;
const grid = new DottedGrid(canvas, config);
grid.start();

const gui = new GUI({ title: "Controls" });

const exportActions = {
  addToProject: () => openExportModal(),
};
gui.add(exportActions, "addToProject").name("→ Add to your project");

const colors = gui.addFolder("Colors");
colors.addColor(config, "bgColor").name("background");
colors.addColor(config, "dotColor").name("grid");

const palette = gui.addFolder("Palette");
palette.domElement.classList.add("palette-folder");

function buildPalette() {
  while (palette.controllers.length > 0) {
    palette.controllers[palette.controllers.length - 1].destroy();
  }
  palette.$children.querySelectorAll(".palette-add-row").forEach((el) => el.remove());

  const proxy: Record<string, string> = {};
  config.palette.forEach((hex, idx) => {
    const key = `c${idx}`;
    proxy[key] = hex;
    const ctrl = palette
      .addColor(proxy, key)
      .name(`color ${idx + 1}`)
      .onChange((v: string) => {
        config.palette[idx] = v;
        grid.rebuild();
      });

    if (config.palette.length > 1) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "palette-remove";
      removeBtn.title = "Remove this color";
      removeBtn.setAttribute("aria-label", "Remove color");
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        config.palette.splice(idx, 1);
        buildPalette();
        grid.rebuild();
        saveConfig();
      });
      ctrl.domElement.appendChild(removeBtn);
    }
  });

  const addRow = document.createElement("div");
  addRow.className = "palette-add-row";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "palette-add-btn";
  addBtn.title = "Add color";
  addBtn.setAttribute("aria-label", "Add color");
  addBtn.textContent = "+";
  addBtn.addEventListener("click", () => {
    config.palette.push("#888888");
    buildPalette();
    grid.rebuild();
    saveConfig();
  });
  addRow.appendChild(addBtn);
  palette.$children.appendChild(addRow);
}

buildPalette();

const sections = gui.addFolder("Color sections");
sections.add(config, "sectionsX", 1, 12, 1).name("sections X").onChange(() => grid.rebuild());
sections.add(config, "sectionsY", 1, 12, 1).name("sections Y").onChange(() => grid.rebuild());

const layout = gui.addFolder("Layout");
layout.add(config, "renderMode", ["dots", "lines"]).name("render mode");
layout.add(config, "dotSize", 0.5, 6, 0.1).name("dot / line size");
layout.add(config, "spacing", 8, 80, 1).name("spacing").onChange(() => grid.rebuild());

const physics = gui.addFolder("Physics");
physics.add(config, "cursorRadius", 0, 400, 1).name("pull radius");
physics.add(config, "cursorStrength", 0, 5, 0.05).name("pull strength");
physics.add(config, "pullRestDelay", 0, 3, 0.05).name("pull rest delay (s)");
physics.add(config, "colorRadius", 0, 600, 1).name("color radius");
physics.add(config, "scrollStrength", 0, 3, 0.05).name("scroll strength");
physics.add(config, "springStiffness", 0.01, 0.3, 0.005).name("spring");
physics.add(config, "damping", 0.5, 0.99, 0.01).name("damping");

gui.onChange(() => saveConfig());

function resetConfig() {
  if (!window.confirm("Reset all controls to defaults?")) return;
  Object.assign(config, defaults, { palette: [...defaults.palette], paused: false });
  buildPalette();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  grid.rebuild();
  saveConfig();
}

function buildPrompt(): string {
  const exportable: GridConfig = { ...config, palette: [...config.palette], paused: false };
  const configJson = JSON.stringify(exportable, null, 2);
  return `Add this animated dotted-grid background to my project.

It's a self-contained Canvas2D component, no dependencies. Please:

1. Add \`grid.ts\` (below) to my project — pick an appropriate location for component code (e.g. \`src/components/\`, \`src/lib/\`) based on what's already there.

2. Mount a full-viewport canvas as the background:
   - Element: \`<canvas id="dotted-grid-bg">\`
   - Style: \`position: fixed; inset: 0; width: 100vw; height: 100lvh; z-index: 0; pointer-events: none; display: block;\` — use \`100lvh\` (large viewport height), not \`100vh\`, so iOS Safari's collapsing URL bar doesn't expose a strip below the grid.
   - Layer all page content above it: wrap content in an element with \`position: relative; z-index: 1;\` (or higher). Do NOT use \`z-index: -1\` on the canvas — it can hide behind the body's stacking context in many frameworks.
   - The canvas paints its own background via \`ctx.fillRect(bgColor)\`; do not set a CSS \`background-color\` on the canvas element. If your page \`<body>\` has its own background-color, that's fine — the canvas covers it.
   - The class attaches its own listeners to \`window\`, so \`pointer-events: none\` on the canvas is correct — clicks still work on content above.

3. Use the right lifecycle for my framework:
   - React/Next: \`useEffect\` with \`return () => grid.stop()\`; client-only ("use client" or dynamic import with \`ssr: false\`).
   - Astro: a \`<script>\` in the layout or a client-only island.
   - Vue/Svelte/Solid: onMount + onCleanup equivalents.
   - Vanilla: \`<script type="module">\` after the canvas in HTML.

4. Use the config below verbatim — it was tuned in a live playground.

=== grid.ts ===
${gridSource}

=== usage ===
import { DottedGrid } from "./grid";

const canvas = document.getElementById("dotted-grid-bg") as HTMLCanvasElement;
const grid = new DottedGrid(canvas, ${configJson});
grid.start();
// Cleanup (on unmount / route change): grid.stop();
`;
}

function createModal(opts: { title: string; scroll?: boolean }): {
  body: HTMLDivElement;
  close: () => void;
} {
  document.querySelector(".app-modal-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "app-modal-overlay";

  const modal = document.createElement("div");
  modal.className = "app-modal";

  const header = document.createElement("div");
  header.className = "app-modal-header";
  const titleEl = document.createElement("h2");
  titleEl.textContent = opts.title;
  const closeBtn = document.createElement("button");
  closeBtn.className = "app-modal-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  header.append(titleEl, closeBtn);

  const body = document.createElement("div");
  body.className = `app-modal-body${opts.scroll ? " app-modal-body--scroll" : ""}`;

  modal.append(header, body);
  overlay.append(modal);
  document.body.append(overlay);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  const close = () => {
    overlay.remove();
    window.removeEventListener("keydown", onKey);
  };
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  window.addEventListener("keydown", onKey);

  return { body, close };
}

function openExportModal() {
  const promptText = buildPrompt();
  const { body } = createModal({ title: "Add to your project" });

  const intro = document.createElement("p");
  intro.className = "app-modal-intro";
  intro.textContent =
    "Paste this into Claude Code, Cursor, or any coding agent in your target project. It includes the component source and your tuned config.";

  const textarea = document.createElement("textarea");
  textarea.className = "export-modal-prompt";
  textarea.readOnly = true;
  textarea.value = promptText;

  const actions = document.createElement("div");
  actions.className = "export-modal-actions";
  const copyBtn = document.createElement("button");
  copyBtn.className = "export-modal-copy";
  copyBtn.textContent = "Copy prompt";
  const sizeNote = document.createElement("span");
  sizeNote.className = "export-modal-size";
  const kb = (new Blob([promptText]).size / 1024).toFixed(1);
  sizeNote.textContent = `${kb} KB`;
  actions.append(copyBtn, sizeNote);

  body.append(intro, textarea, actions);

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      copyBtn.textContent = "Copied ✓";
      copyBtn.classList.add("is-copied");
      setTimeout(() => {
        copyBtn.textContent = "Copy prompt";
        copyBtn.classList.remove("is-copied");
      }, 1600);
    } catch {
      textarea.select();
      document.execCommand("copy");
      copyBtn.textContent = "Copied ✓";
      setTimeout(() => (copyBtn.textContent = "Copy prompt"), 1600);
    }
  });
}

function openHelpModal() {
  const { body } = createModal({ title: "About these controls", scroll: true });
  body.innerHTML = `
    <section class="help-section">
      <h3>Colors</h3>
      <p>The neutral colors of the canvas before the cursor reveals any accents.</p>
      <table>
        <tbody>
          <tr><th scope="row">background</th><td>The page background, painted by the canvas.</td></tr>
          <tr><th scope="row">grid</th><td>The default color of dots and lines when the cursor isn't nearby.</td></tr>
        </tbody>
      </table>
    </section>

    <section class="help-section">
      <h3>Palette</h3>
      <p>Seven accent colors. The cursor reveals these by tinting nearby dots toward whichever palette color is anchored to that part of the screen.</p>
    </section>

    <section class="help-section">
      <h3>Color sections</h3>
      <p>Divides the screen into a grid of regions, each anchored to a palette color. Colors blend smoothly across regions. Higher values = more color variation across the screen.</p>
      <table>
        <tbody>
          <tr><th scope="row">sections X</th><td>Number of horizontal regions.</td></tr>
          <tr><th scope="row">sections Y</th><td>Number of vertical regions.</td></tr>
        </tbody>
      </table>
    </section>

    <section class="help-section">
      <h3>Layout</h3>
      <p>How the grid is drawn — dots or lines, how big, how dense.</p>
      <table>
        <tbody>
          <tr><th scope="row">render mode</th><td>Draw the grid as dots or as connected lines (mesh look).</td></tr>
          <tr><th scope="row">dot / line size</th><td>Pixel size of each dot, or stroke width of each line.</td></tr>
          <tr><th scope="row">spacing</th><td>Distance between grid points in pixels. Smaller = denser.</td></tr>
        </tbody>
      </table>
    </section>

    <section class="help-section">
      <h3>Physics</h3>
      <p>How the grid reacts to the cursor and to scroll.</p>
      <table>
        <tbody>
          <tr><th scope="row">pull radius</th><td>How close the cursor needs to be to attract a dot. Larger = a wider area of the grid warps around the cursor.</td></tr>
          <tr><th scope="row">pull strength</th><td>How hard the cursor pulls dots toward it. Higher = more dramatic distortion.</td></tr>
          <tr><th scope="row">pull rest delay (s)</th><td>Seconds the cursor must be still before the pull fades to zero. Lets the grid relax back to rest when you stop moving.</td></tr>
          <tr><th scope="row">color radius</th><td>How far from the cursor the color reveal extends. Usually larger than the pull radius, so color washes beyond the warped area.</td></tr>
          <tr><th scope="row">scroll strength</th><td>Vertical kick applied to dots when you scroll the page. 0 disables the scroll reaction.</td></tr>
          <tr><th scope="row">spring</th><td>How stiffly each dot returns to its resting position. Low = soft and wobbly, high = snappy and tight.</td></tr>
          <tr><th scope="row">damping</th><td>How much velocity is lost each frame. Low = bouncy and oscillating, high = settles quickly.</td></tr>
        </tbody>
      </table>
    </section>
  `;
}

const helpFooter = document.createElement("div");
helpFooter.className = "panel-help";

const helpLink = document.createElement("a");
helpLink.className = "panel-help-link";
helpLink.href = "#";
helpLink.textContent = "What do these controls do?";
helpLink.addEventListener("click", (e) => {
  e.preventDefault();
  openHelpModal();
});

function makeDivider(): HTMLSpanElement {
  const d = document.createElement("span");
  d.className = "panel-help-divider";
  d.textContent = "·";
  return d;
}

const repoLink = document.createElement("a");
repoLink.className = "panel-help-link";
repoLink.href = "https://github.com/govambam/iridesce";
repoLink.target = "_blank";
repoLink.rel = "noopener";
repoLink.textContent = "GitHub ↗";

const resetLink = document.createElement("a");
resetLink.className = "panel-help-link";
resetLink.href = "#";
resetLink.textContent = "Reset";
resetLink.addEventListener("click", (e) => {
  e.preventDefault();
  resetConfig();
});

helpFooter.append(helpLink, makeDivider(), repoLink, makeDivider(), resetLink);
gui.domElement.appendChild(helpFooter);
