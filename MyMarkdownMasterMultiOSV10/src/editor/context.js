// What the editor's extensions need from the host (one object per editor instance): the note path,
// link resolution, image URLs and the callbacks. Read through a facet so extensions stay stateless.
import { Facet } from '@codemirror/state';

export const editorContext = Facet.define({ combine: (values) => values[0] ?? {} });

/** The host context of a view or state. */
export const contextOf = (viewOrState) => (viewOrState.state ?? viewOrState).facet(editorContext);
