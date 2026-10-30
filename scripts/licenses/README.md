# Supplemental bundled notices

The build copies package license files from installed dependencies. These supplemental copies cover dependencies whose npm distributions omit their license file:

- `excalidraw.txt`: https://raw.githubusercontent.com/excalidraw/excalidraw/v0.18.1/LICENSE
- `radix-ui.txt`: https://raw.githubusercontent.com/radix-ui/primitives/main/LICENSE
- `fastdom.txt`: License section of the installed fastdom 1.0.12 README.
- `fuzzy.txt`: https://raw.githubusercontent.com/mattyork/fuzzy/master/LICENSE-MIT
- `react-remove-scroll-bar.txt`: https://raw.githubusercontent.com/theKashey/react-remove-scroll-bar/master/LICENSE

`FONTS.txt` preserves copyright and license metadata extracted from the bundled font binaries. Assistant, Excalifont, Lilita, Nunito, Virgil, and Xiaolai use SIL OFL 1.1 (full text included in the Virgil metadata). Comic Shanns includes its MIT license; Cascadia includes its license terms. `font-Excalifont.txt` retains the full font metadata/license comment from the pinned upstream source at `packages/excalidraw/fonts/Excalifont/index.ts`.

Liberation includes GPL v2 and its font exception, copied from https://github.com/liberationfonts/liberation-1.7-fonts/tree/liberation-fonts-1_07_3 (`COPYING` and `License.txt`). Font sources are available in that repository. These files are incorporated into the generated `public/vendor/whiteboard/LICENSES.txt`.
