/* =============================================================
 * USER STUDY CONFIGURATION
 * -------------------------------------------------------------
 * Edit this file only. Drop images into images/sceneNN/ and point
 * the paths below at them. Everything else is driven from here.
 * ============================================================= */

const STUDY = {
  title: "3D Scene Reconstruction — Perceptual Quality Study",
  subtitle:
    "You will see 10 real indoor scenes. For each scene, compare the reconstructions produced by several methods against the real RGB reference.",

  /* ~~~ Minutes estimate shown on the welcome page ~~~ */
  estimatedMinutes: 15,

  /* ~~~ Randomise the left-to-right order of methods per participant.
         Keeps the study blind. Set to false for debugging. ~~~ */
  shuffleMethods: true,

  /* ~~~ Randomise the order in which scenes are presented. ~~~ */
  shuffleScenes: false,

  /* ~~~ Require every question answered before "Next" unlocks. ~~~ */
  requireAllAnswers: true,

  /* ~~~ Optional: POST results here on submit. Leave "" to rely on
         the CSV/JSON download only (works from file:// too). ~~~ */
  submitEndpoint: "",

  /* =========================== METHODS ===========================
   * `key`   OPAQUE slug (m1, m2, ...). This is what goes into image
   *         paths and into the results file. It must NOT be a real
   *         method name — this file is downloaded by the browser, so
   *         anything written here is visible to participants.
   *         Which slug is which method lives in ../method_key.json,
   *         which is outside the served directory. Decode after
   *         collection with:  python3 decode_results.py <results.csv>
   * The letter a participant sees is NOT set here: it is assigned from
   * the shuffled on-screen position of each scene (leftmost = A), so the
   * same method wears a different letter on every scene.
   * ============================================================== */
  methods: [{ key: "m1" }, { key: "m2" }, { key: "m3" }, { key: "m4" }],

  /* =========================== QUESTIONS =========================
   * Three 1–5 star ratings, asked once per method per scene.
   * ============================================================== */
  questions: [
    {
      id: "layout",
      title: "Layout accuracy",
      prompt:
        "How well does the reconstruction reproduce the room layout — walls, floor extent, and the position &amp; orientation of objects?",
      lowLabel: "Layout is wrong",
      highLabel: "Layout matches",
    },
    {
      id: "objects",
      title: "Object similarity",
      prompt:
        "How closely do the individual reconstructed objects resemble the real ones in shape, scale, and appearance?",
      lowLabel: "Objects unrecognisable",
      highLabel: "Objects match",
    },
    {
      id: "overall",
      title: "Overall scene similarity",
      prompt:
        "Taking everything together, how similar is the reconstructed scene to the real scene?",
      lowLabel: "Not similar",
      highLabel: "Very similar",
    },
  ],

  /* ============================ SCENES ===========================
   * One entry per scene. For each method supply:
   *   render : the reconstruction rendered from the SAME viewpoint
   *            as the RGB reference frame
   *   ortho  : the top-down orthographic plan view
   * A missing/empty path renders a visible "missing image" tile so
   * you can spot gaps while assembling the study.
   * ============================================================== */
  scenes: [
    scene("01"),
    scene("02"),
    scene("03"),
    scene("04"),
    scene("05"),
    scene("06"),
    scene("07"),
    scene("08"),
    scene("09"),
    scene("10"),
  ],
};

/* Helper: conventional file layout, so you only name the folder.
 *   images/sceneNN/rgb.jpg          reference RGB frame
 *   images/sceneNN/<method>_render.jpg
 *   images/sceneNN/<method>_ortho.jpg
 * Override any single path by editing the returned object inline. */
function scene(nn, overrides = {}) {
  const dir = `images/scene${nn}`;
  const perMethod = {};
  for (const m of ["m1", "m2", "m3", "m4"]) {
    perMethod[m] = {
      render: `${dir}/${m}_render.jpg`,
      ortho: `${dir}/${m}_ortho.jpg`,
    };
  }
  return Object.assign(
    {
      id: `scene${nn}`,
      name: `Scene ${nn}`,
      rgb: `${dir}/rgb.jpg`,
      rgbOrtho: `${dir}/rgb_ortho.jpg`, // optional: reference plan view
      methods: perMethod,
    },
    overrides
  );
}
