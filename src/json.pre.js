const removePosition = require('unist-util-remove-position');

const KEYS_TO_REMOVE = ['position'];

// module.exports.pre is a function (taking next as an argument)
// that returns a function (with payload, secrets, logger as arguments)
// that calls next (after modifying the payload a bit)
function pre(payload, config) {
  const p = payload;

  delete p.resource.body;
  delete p.resource.html;

  p.resource.mdast = removePosition(p.resource.mdast);
  p.resource.htast = removePosition(p.resource.htast);

  let jsonStr = JSON.stringify(p);
  p.json = jsonStr;

  return p;
}

module.exports.pre = pre;
