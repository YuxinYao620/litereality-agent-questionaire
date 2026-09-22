# Perceptual quality study — indoor scene reconstruction

A blind, self-contained web questionnaire. Participants compare reconstructions
of ten real indoor scenes against the original capture and rate each one on
three criteria.

**Take the study:** open the GitHub Pages link for this repository.

## What a participant does

For each of the ten scenes they see two comparisons — a perspective view (the
reference RGB frame plus each system's render from that same camera pose) and an
orthographic plan view — then rate every system from 1 to 5 stars on layout
accuracy, object similarity, and overall scene similarity.

The systems are anonymous. They appear as the letters A–D assigned by on-screen
position, and that order is reshuffled on every scene, so a letter carries no
identity across scenes. Scenes are likewise shown only as "Scene 01"–"Scene 10".

Progress is saved in the browser, so the tab can be closed and resumed. At the
end the participant downloads their responses and returns the file.

## Layout

```
index.html      page shell
app.js          study runtime (state, shuffling, rating, export)
config.js       scenes, questions, and the anonymous system slugs
style.css       styling
images/         sceneNN/ - reference frames and each system's renders
bump.sh         re-stamps the asset version after editing js/css
```

Everything configurable lives in `config.js`.

## A note on the anonymity

Nothing in this repository says which system is which, by design — not the
config, not the image filenames, not the results file. That mapping is held
separately by the study coordinator and applied only after responses are
collected.
