'use strict';

// preview/ is the playable build. This script must not copy the live site root
// over it, and must not rewrite index.html.
//   node scripts/build-preview.js

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');

['preview/index.html', 'preview/data/wasted_tower.js', 'preview/js/engine.js'].forEach(function (rel) {
  if (!fs.existsSync(path.join(root, rel))) {
    console.error('missing ' + rel);
    process.exit(1);
  }
});

console.log('preview/ is already the playable build. Nothing was copied. index.html was not touched.');
