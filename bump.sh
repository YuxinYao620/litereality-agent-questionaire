#!/bin/sh
# Re-stamp the asset version in index.html. Run after editing style.css / app.js
# / config.js so browsers pick the change up on a normal reload -- python3's
# http.server sends no cache headers, so without this they serve stale copies.
v=$(date +%Y%m%d%H%M%S)
sed -i '' -E "s/(style\.css|app\.js|config\.js)\?v=[0-9]+/\1?v=$v/g" "$(dirname "$0")/index.html"
echo "assets stamped v=$v"
