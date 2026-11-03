/**
 * Serialized tree representation returned by data().
 * Format: Array containing the root node object.
 * Leaf nodes are strings, parent nodes are { [nodeName]: children[] }.
 * 
 * Example:
 * [
 *   {
 *     "root": [
 *       {
 *         "labelContainer": [
 *           "requiredIndicator",
 *           "label",
 *           "secondaryDescription"
 *         ]
 *       },
 *       {
 *         "control": [
 *           "value",
 *           "placeholder",
 *           "startIcon"
 *         ]
 *       }
 *     ]
 *   }
 * ]
 */
/**
 * A parent layout node: element name as key, ordered child `LayoutNode`s as value.
 * @since 0.39.0
 */
export type LayoutBranch = { [nodeName: string]: LayoutNode[] };

export type LayoutNode = string | LayoutBranch;
export type Layout = LayoutNode[];
