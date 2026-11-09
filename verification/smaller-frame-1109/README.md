# Smaller exit frame

The framed painting shown after leaving the canvas is now 75% of its previous width and height, including the decorative rim. Desktop and mobile rules use the same scale. Full-screen viewing, memory previews and animation timing are unchanged.

Verification:
- Production build and `git diff --check` passed.
- At 1280 × 720, the Starry Night frame measures 550.88 × 456 px, down from 734.51 × 608 px.
- Reopened Starry Night from an isolated QA memory slot and captured the exit frame in `frame-75-percent.png`.
