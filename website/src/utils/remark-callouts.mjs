import { visit } from 'unist-util-visit';

/**
 * Remark plugin to transform callouts/admonitions in two formats:
 *
 * GitHub-style blockquotes:
 * > [!NOTE] - Blue info callout
 * > [!TIP] - Green tip callout
 * > [!WARNING] - Yellow warning callout
 * > [!CAUTION] or [!DANGER] - Red danger callout
 *
 * Docusaurus-style directives:
 * :::note [optional title]
 * :::info [optional title]
 * :::tip [optional title]
 * :::warning [optional title]
 * :::caution [optional title]
 * :::danger [optional title]
 */
export function remarkCallouts() {
  const calloutTypes = {
    NOTE: { class: 'callout-note', icon: 'info', title: 'Note' },
    INFO: { class: 'callout-note', icon: 'info', title: 'Note' },
    TIP: { class: 'callout-tip', icon: 'lightbulb', title: 'Tip' },
    WARNING: { class: 'callout-warning', icon: 'alert-triangle', title: 'Warning' },
    CAUTION: { class: 'callout-danger', icon: 'alert-octagon', title: 'Caution' },
    DANGER: { class: 'callout-danger', icon: 'alert-octagon', title: 'Danger' },
  };

  function buildCalloutNode(config, title, children) {
    return {
      type: 'mdxJsxFlowElement',
      name: 'div',
      attributes: [
        { type: 'mdxJsxAttribute', name: 'className', value: `callout ${config.class}` }
      ],
      children: [
        {
          type: 'mdxJsxFlowElement',
          name: 'div',
          attributes: [
            { type: 'mdxJsxAttribute', name: 'className', value: 'callout-title' }
          ],
          children: [
            {
              type: 'mdxJsxFlowElement',
              name: 'span',
              attributes: [
                { type: 'mdxJsxAttribute', name: 'className', value: `callout-icon callout-icon-${config.icon}` }
              ],
              children: []
            },
            { type: 'text', value: title }
          ]
        },
        {
          type: 'mdxJsxFlowElement',
          name: 'div',
          attributes: [
            { type: 'mdxJsxAttribute', name: 'className', value: 'callout-content' }
          ],
          children
        }
      ]
    };
  }

  // Handles :::type ... ::: where blank lines are present (multi-paragraph).
  // Covers opening and closing edge cases:
  //   - Opening: :::type may be standalone or immediately followed by content
  //     (no blank line → opening line merges with first content line into one paragraph)
  //   - Closing: ::: may be a standalone paragraph or directly preceded by content
  //     on the same line (no blank line → closing ::: is the last line of a paragraph)
  // Recurses bottom-up so inner directives are resolved first.
  function processBlockDirectives(node) {
    if (!Array.isArray(node.children)) return;

    for (const child of node.children) {
      processBlockDirectives(child);
    }

    // Returns 'standalone' if the paragraph is exactly ':::', 'embedded' if its
    // last text child ends with '\n:::', or null if it is not a closing marker.
    function closingKind(s) {
      if (s.type !== 'paragraph') return null;
      const last = s.children?.[s.children.length - 1];
      if (last?.type !== 'text') return null;
      if (s.children.length === 1 && last.value.trim() === ':::') return 'standalone';
      if (/\n:::\s*$/.test(last.value)) return 'embedded';
      return null;
    }

    // True if `s` opens a nested directive of the same kind this loop handles,
    // so its closing ::: must be skipped rather than treated as ours.
    function isOpeningMarker(s) {
      if (s.type !== 'paragraph') return false;
      const firstText = s.children?.[0];
      if (firstText?.type !== 'text') return false;
      const match = firstText.value.match(/^:::(\w+)/);
      return !!(match && calloutTypes[match[1].toUpperCase()]);
    }

    let i = 0;
    while (i < node.children.length) {
      const child = node.children[i];

      if (child.type === 'paragraph') {
        const firstText = child.children?.[0];
        if (firstText?.type === 'text') {
          const match = firstText.value.match(/^:::(\w+)[ \t]*(.*?)(?:\n|$)/);
          if (match) {
            const type = match[1].toUpperCase();
            const config = calloutTypes[type];
            if (config) {
              let j = i + 1;
              let kind = null;
              let depth = 0;
              while (j < node.children.length) {
                const sibling = node.children[j];
                if (isOpeningMarker(sibling)) {
                  depth++;
                } else {
                  const k = closingKind(sibling);
                  if (k) {
                    if (depth === 0) { kind = k; break; }
                    depth--;
                  }
                }
                j++;
              }

              if (j < node.children.length) {
                const title = match[2]?.trim() || config.title;

                // Content from sibling nodes between opening and closing markers
                let contentNodes = node.children.slice(i + 1, j);

                // Closing paragraph has content before :::  — strip \n::: suffix and
                // include it as the last content block.
                if (kind === 'embedded') {
                  const closingPara = node.children[j];
                  const last = closingPara.children[closingPara.children.length - 1];
                  const stripped = { ...last, value: last.value.replace(/\n:::\s*$/, '') };
                  const newChildren = [
                    ...closingPara.children.slice(0, -1),
                    stripped,
                  ].filter(c => !(c.type === 'text' && c.value === ''));
                  if (newChildren.length > 0) {
                    contentNodes = [...contentNodes, { type: 'paragraph', children: newChildren }];
                  }
                }

                // Opening paragraph has content after the marker line — strip the
                // :::type\n prefix and prepend the rest as the first content block.
                const afterMarker = firstText.value.slice(match[0].length);
                const restInlineChildren = child.children.slice(1);
                if (afterMarker || restInlineChildren.length > 0) {
                  const newChildren = afterMarker
                    ? [{ ...firstText, value: afterMarker }, ...restInlineChildren]
                    : restInlineChildren;
                  contentNodes = [{ type: 'paragraph', children: newChildren }, ...contentNodes];
                }

                // Resolve any directive nested inside this one's content before wrapping it.
                processBlockDirectives({ children: contentNodes });

                node.children.splice(i, j - i + 1, buildCalloutNode(config, title, contentNodes));
                continue;
              }
            }
          }
        }
      }

      i++;
    }
  }

  return (tree) => {
    // 1. GitHub-style > [!TYPE] callouts
    visit(tree, 'blockquote', (node, index, parent) => {
      const firstChild = node.children[0];
      if (!firstChild || firstChild.type !== 'paragraph') return;

      const firstText = firstChild.children[0];
      if (!firstText || firstText.type !== 'text') return;

      const match = firstText.value.match(/^\[!(NOTE|TIP|WARNING|CAUTION|DANGER)\]\s*/i);
      if (!match) return;

      const type = match[1].toUpperCase();
      const config = calloutTypes[type];
      if (!config) return;

      firstText.value = firstText.value.slice(match[0].length);
      if (firstText.value === '') firstChild.children.shift();
      if (firstChild.children.length === 0) node.children.shift();

      parent.children[index] = buildCalloutNode(config, config.title, node.children);
    });

    // 2. Docusaurus-style :::type ... ::: WITHOUT blank lines.
    // remark collapses the entire block into one paragraph with embedded \n.
    // The opening marker appears at the start of the first text child and the
    // closing ::: at the end of the last text child.
    visit(tree, 'paragraph', (node, index, parent) => {
      const children = node.children;
      if (!children?.length) return;

      const firstChild = children[0];
      if (firstChild.type !== 'text') return;

      const openMatch = firstChild.value.match(/^:::(\w+)[ \t]*(.*?)\n/);
      if (!openMatch) return;

      const type = openMatch[1].toUpperCase();
      const config = calloutTypes[type];
      if (!config) return;

      const lastChild = children[children.length - 1];
      if (lastChild.type !== 'text' || !/\n:::\s*$/.test(lastChild.value)) return;

      const title = openMatch[2].trim() || config.title;

      firstChild.value = firstChild.value.slice(openMatch[0].length);
      lastChild.value = lastChild.value.replace(/\n:::\s*$/, '');

      const contentChildren = children.filter(c => !(c.type === 'text' && c.value === ''));

      parent.children[index] = buildCalloutNode(config, title, [
        { type: 'paragraph', children: contentChildren }
      ]);
    });

    // 3. Docusaurus-style :::type ... ::: WITH blank lines (multi-paragraph)
    processBlockDirectives(tree);
  };
}
