import { StreamLanguage } from '@codemirror/language';

/**
 * A BibTeX stream parser for .bib files — @entry types and cite keys read as
 * keywords/variables, field names as properties, braced values as strings, %
 * comments. Hand-rolled (~30 lines) rather than pulling all of
 * @codemirror/legacy-modes for one mode; colors come from the editor's
 * default highlight style.
 */
export const bibtex = () => StreamLanguage.define({
  name: 'bibtex',
  startState(): { inEntry: boolean; inValue: boolean } { return { inEntry: false, inValue: false }; },
  token(stream, state) {
    if (stream.eatSpace()) return null;
    if (stream.sol() && stream.match(/%.*/, true)) return 'comment';
    if (!state.inEntry) {
      if (stream.match(/@[A-Za-z]+\s*\{\s*[^,\s}]*/)) { state.inEntry = true; state.inValue = false; return 'keyword'; }
      stream.next();
      return null;
    }
    if (stream.match('}')) { state.inEntry = false; return 'keyword'; }
    if (state.inValue) {
      if (stream.match(/\{[^{}]*\}/) || stream.match(/"[^"]*"/) || stream.match(/[^\s,}]+/)) return 'string';
      stream.next();
      return null;
    }
    if (stream.match(/[A-Za-z][\w-]*(?=\s*=)/)) return 'propertyName';
    if (stream.match('=')) { state.inValue = true; return 'operator'; }
    if (stream.match(',')) { state.inValue = false; return null; }
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: '%' } },
});
