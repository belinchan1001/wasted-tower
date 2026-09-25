'use strict';

// Copy the playable static files into preview/. Does not touch the site root.
//   node scripts/build-preview.js

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var files = [
  'index.html',
  'data/wasted_tower.js',
  'js/engine.js',
  'js/narrator.js',
  'js/ui.js'
];

files.forEach(function (rel) {
  var dest = path.join(root, 'preview', rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(root, rel), dest);
});

console.log('preview updated (' + files.length + ' files)');
