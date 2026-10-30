# Slate

Before making UI changes, read and follow [DESIGN.md](DESIGN.md).

Lucide is the required application icon library. Selected elements use neutral surface changes; ghost outlines, border-like selection shadows, and purple bottom selection borders are prohibited. Preserve visible neutral keyboard focus indicators. Exception: Excalidraw whiteboards keep Excalidraw's original icons, toolbars, menus, and selection styling; do not replace them with Lucide controls (see DESIGN.md).

Keep all runtime assets local and retain bundled dependency license notices. Run `node --test` for application changes and rebuild any modified generated assets.
