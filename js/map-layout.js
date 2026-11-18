export const ROW_HEIGHT = 48;
export const FIRST_COLUMN = 120;
export const COLUMN_WIDTH = 236;

const RIGHT = 1;
const LEFT = -1;

export function layoutMindMap(garden, { singleSide = false } = {}) {
  const weights = new Map();
  const weigh = id => {
    const children = garden.childrenOf(id);
    const weight = children.length ? children.reduce((sum, child) => sum + weigh(child.id), 0) : 1;
    weights.set(id, weight);
    return weight;
  };

  const roots = garden.roots();
  roots.forEach(root => weigh(root.id));

  const sides = splitBySide(roots, weights, singleSide);
  const nodes = [];
  const links = [];

  const place = (idea, depth, top, dir, parentId) => {
    const weight = weights.get(idea.id);
    nodes.push({
      id: idea.id,
      title: idea.title,
      depth,
      dir,
      x: dir * (FIRST_COLUMN + (depth - 1) * COLUMN_WIDTH),
      y: (top + weight / 2) * ROW_HEIGHT
    });
    links.push({ from: parentId, to: idea.id, dir });
    let childTop = top;
    garden.childrenOf(idea.id).forEach(child => {
      place(child, depth + 1, childTop, dir, idea.id);
      childTop += weights.get(child.id);
    });
  };

  for (const { dir, ideas, total } of sides) {
    let top = -total / 2;
    ideas.forEach(root => {
      place(root, 1, top, dir, null);
      top += weights.get(root.id);
    });
  }

  return { nodes, links };
}

function splitBySide(roots, weights, singleSide) {
  const right = { dir: RIGHT, ideas: [], total: 0 };
  const left = { dir: LEFT, ideas: [], total: 0 };
  roots.forEach(root => {
    const side = singleSide || right.total <= left.total ? right : left;
    side.ideas.push(root);
    side.total += weights.get(root.id);
  });
  return [right, left];
}
