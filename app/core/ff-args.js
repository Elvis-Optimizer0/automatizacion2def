// Shared FFmpeg args helper: one array element per token, flag and value separate
// Usage: const args = [...flag('-i', path), ...flag('-c', 'libx264'), ...]

const pathModule = require('path');

// Single flag + value as two separate array elements
function flag(name, value) {
  return [name, value];
}

// Multiple paths as separate -i elements (flat array)
function inputs(paths) {
  var result = [];
  for (var i = 0; i < paths.length; i++) {
    result.push('-i', pathModule.resolve(paths[i]));
  }
  return result;
}

// Single path as -i element
function input(path) {
  return ['-i', pathModule.resolve(path)];
}

// Output path as -o element (or last positional arg)
function outputPath(dir, filename) {
  return pathModule.join(dir, filename);
}

module.exports = { flag, inputs, input, outputPath };