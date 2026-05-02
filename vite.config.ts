import { defineConfig } from "vite";

// Built output is copied into ../public/playground/ during the parent
// site's build, so all asset URLs need to resolve under /playground/.
export default defineConfig({
  base: "/playground/",
});
