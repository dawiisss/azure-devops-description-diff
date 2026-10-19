/**
 * ADO History Diff - HTML Diff Engine
 * Cross-browser & Node.js compatible
 * Compares two HTML snippets word-by-word and wraps differences in <ins> and <del> tags.
 *
 * Based on htmldiff.js (https://github.com/tnwinc/htmldiff.js)
 * Originally by Ian Bicking / The Next Web
 * Copyright (c) 2014 The Next Web
 * Licensed under the MIT License (https://opensource.org/licenses/MIT)
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.htmldiff = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
/**
 * htmldiff.js is a library that compares HTML content. It creates a diff between two
 * HTML documents by combining the two documents and wrapping the differences with
 * <ins> and <del> tags. Here is a high-level overview of how the diff works.
 *
 * 1. Tokenize the before and after HTML with htmlToTokens.
 * 2. Generate a list of operations that convert the before list of tokens to the after
 *    list of tokens with calculateOperations, which does the following:
 *      a. Find all the matching blocks of tokens between the before and after lists of
 *         tokens with findMatchingBlocks. This is done by finding the single longest
 *         matching block with findMatch, then iteratively finding the next longest
 *         matching blocks that precede and follow the longest matching block.
 *      b. Determine insertions, deletions, and replacements from the matching blocks.
 *         This is done in calculateOperations.
 * 3. Render the list of operations by wrapping tokens with <ins> and <del> tags where
 *    appropriate with renderOperations.
 *
 * Example usage:
 *
 *   diff('<p>this is some text</p>', '<p>this is some more text</p>')
 *   == '<p>this is some <ins>more </ins>text</p>'
 *
 *   diff('<p>this is some text</p>', '<p>this is some more text</p>', 'diff-class')
 *   == '<p>this is some <ins class="diff-class">more </ins>text</p>'
 */
function isEndOfTag(char) {
    return char === '>';
}
function isStartOfTag(char) {
    return char === '<';
}
function isWhitespace(char) {
    return /^\s+$/.test(char);
}
function exhaustive(a) {
    return a;
}
const tagRegExp = /^\s*<([^!>][^>]*)>\s*$/;
/**
 * Determines if the given token is a tag.
 *
 * @param {string} token The token in question.
 *
 * @return {boolean|string} False if the token is not a tag, or the tag name otherwise.
 */
function isTag(token) {
    var _a;
    const match = tagRegExp.exec(token);
    return !!match && ((_a = match[1]) === null || _a === void 0 ? void 0 : _a.trim().split(' ')[0]);
}
function isntTag(token) {
    return !isTag(token);
}
function isStartOfHTMLComment(word) {
    return /^<!--/.test(word);
}
function isEndOfHTMLComment(word) {
    return /-->$/.test(word);
}
// Added head and style (for style tags inside the body)
const atomicTagsRegExp = /^<(iframe|object|math|svg|script|video|head|style|a)$/;
/**
 * Checks if the current word is the beginning of an atomic tag. An atomic tag is one whose
 * child nodes should not be compared - the entire tag should be treated as one token. This
 * is useful for tags where it does not make sense to insert <ins> and <del> tags.
 *
 * @param {string} word The characters of the current token read so far.
 *
 * @return {string|null} The name of the atomic tag if the word will be an atomic tag,
 *    null otherwise
 */
function isStartOfAtomicTag(word) {
    const result = atomicTagsRegExp.exec(word);
    return result && result[1];
}
/**
 * Checks if the current word is the end of an atomic tag (i.e. it has all the characters,
 * except for the end bracket of the closing tag, such as '<iframe></iframe').
 *
 * @param {string} word The characters of the current token read so far.
 * @param {string} tag The ending tag to look for.
 *
 * @return {boolean} True if the word is now a complete token (including the end tag),
 *    false otherwise.
 */
function isEndOfAtomicTag(word, tag) {
    return word.substring(word.length - tag.length - 2) === ('</' + tag);
}
const styleTagsRegExp = /^<(strong|em|b|i|q|cite|mark|dfn|sup|sub|u|s|span|nobr)(\s+[^>]*)?(^(?!\w)|>)/;
/**
 * Checks if the current word is the beginning of a style tag. A style tag is one whose
 * child nodes should be compared, but the entire tag should be treated as one token. This
 * is useful for tags where it does not make sense to insert <ins> and <del> tags.
 *
 * @param {string} word The characters of the current token read so far.
 *
 * @return {string|null} The name of the atomic tag if the word will be an atomic tag,
 *    null otherwise
 */
function isStartOfStyleTag(word) {
    var _a;
    const result = styleTagsRegExp.exec(word);
    if (result && result[1]) {
        return {
            tag: result[1],
            tagWithAttributes: result[1] + ((_a = result[2]) !== null && _a !== void 0 ? _a : ''),
        };
    }
    return null;
}
/**
 * Checks if the current word is the end of a style tag (i.e. it has all the characters,
 * except for the end bracket of the closing tag, such as '<strong></strong').
 *
 * @param {string} word The characters of the current token read so far.
 * @param {Style} tag The ending tag to look for.
 *
 * @return {boolean} True if the word is now a complete token (including the end tag),
 *    false otherwise.
 */
function isEndOfStyleTag(word, tag) {
    return word.substring(word.length - tag.tag.length - 2) === ('</' + tag.tag);
}
const tableTagsRegExp = /^<(table|tbody|thead|tr|th|td|blockquote|ul|ol|li|h[1-6])(^(?!\w)|>)/;
/**
 * Checks if the current word is the beginning of a table tag. A table tag is one whose
 * child nodes should be compared, but the entire tag should be treated as one token. This
 * is useful for tags where it does not make sense to insert <ins> and <del> tags. We include
 * blockquotes here because their external styling makes them closer to table tags in their
 * handling than other style tags.
 *
 * @param {string} word The characters of the current token read so far.
 *
 * @return {string|null} The name of the atomic tag if the word will be an atomic tag,
 *    null otherwise
 */
function isStartOfTableTag(word) {
    const result = tableTagsRegExp.exec(word);
    return result && result[1];
}
/**
* Checks if the current word is the end of a table tag (i.e. it has all the characters,
* except for the end bracket of the closing tag, such as '<td></td').
*
* @param {string} word The characters of the current token read so far.
* @param {string} tag The ending tag to look for.
*
* @return {boolean} True if the word is now a complete token (including the end tag),
*    false otherwise.
*/
function isEndOfTableTag(word, tag) {
    return word.substring(word.length - tag.length - 2) === ('</' + tag);
}
/**
 * Checks if a tag is a void tag.
 *
 * @param {string} token The token to check.
 *
 * @return {boolean} True if the token is a void tag, false otherwise.
 */
function isVoidTag(token) {
    return /^\s*<[^>]+\/>\s*$/.test(token);
}
/**
 * Checks if a token can be wrapped inside a tag.
 *
 * @param {string} token The token to check.
 *
 * @return {boolean} True if the token can be wrapped inside a tag, false otherwise.
 */
function isWrappable(token) {
    const isImg = /^<img[\s>]/.test(token);
    return isImg || isntTag(token) || !!isStartOfAtomicTag(token) || isVoidTag(token);
}
/**
 * Creates a token that holds a string and key representation. The key is used for diffing
 * comparisons and the string is used to recompose the document after the diff is complete.
 *
 * @param {string} currentWord The section of the document to create a token for.
 *
 * @return {Object} A token object with a string and key property.
 */
function createToken(currentWord, currentStyleTags, currentTableTags) {
    return {
        str: currentWord,
        key: getKeyForToken(currentWord),
        styles: [...currentStyleTags],
        tableTags: [...currentTableTags],
    };
}
/**
 * A Match stores the information of a matching block. A matching block is a list of
 * consecutive tokens that appear in both the before and after lists of tokens.
 *
 * @param {number} startInBefore The index of the first token in the list of before tokens.
 * @param {number} startInAfter The index of the first token in the list of after tokens.
 * @param {number} length The number of consecutive matching tokens in this block.
 * @param {Segment} segment The segment where the match was found.
 */
function makeMatch(startInBefore, startInAfter, length, segment) {
    return {
        segment: segment,
        length: length,
        startInBefore: startInBefore + segment.beforeIndex,
        startInAfter: startInAfter + segment.afterIndex,
        endInBefore: startInBefore + segment.beforeIndex + length - 1,
        endInAfter: startInAfter + segment.afterIndex + length - 1,
        segmentStartInBefore: startInBefore,
        segmentStartInAfter: startInAfter,
        segmentEndInBefore: startInBefore + length - 1,
        segmentEndInAfter: startInAfter + length - 1
    };
}
/**
 * Splits a string into an array of words, taking into account locale-specific word boundaries.
 * Note that this is different from simply splitting by whitespace, as some languages such as
 * Japanese do not use spaces to separate words.
 *
 * @param str The string to split.
 * @returns The individual words in `str`.
 */
function splitStringLocaleAware(str) {
    if (Intl === null || Intl === void 0 ? void 0 : Intl.Segmenter) { // eslint-disable-line
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' }); // eslint-disable-line
        const segments = segmenter.segment(str); // eslint-disable-line
        const toReturn = [];
        for (const segment of segments) {
            toReturn.push(segment.segment); // eslint-disable-line
        }
        return toReturn;
    }
    else {
        // Fallback for environments without Intl.Segmenter: No additional splitting.
        // Since htmlToTokens() already splits by whitespace, it means we support only languages that split words
        // by whitespace. (Japanese would be an example where this is not the case and which will therefore not work.)
        return [str];
    }
}
function splitStringLocaleAwareAndCreateTokens(currentWord, currentStyleTags, currentTableTags) {
    const parts = splitStringLocaleAware(currentWord);
    const tokens = [];
    for (const token of parts) {
        tokens.push(createToken(token, currentStyleTags, currentTableTags));
    }
    return tokens;
}
/**
 * Tokenizes a string of HTML.
 *
 * @param {string} html The string to tokenize.
 *
 * @return {Array.<string>} The list of tokens.
 */
function htmlToTokens(html) {
    let mode = 'char';
    let currentWord = '';
    let currentAtomicTag = '';
    const currentStyleTags = [];
    const currentTableTags = [];
    const words = [];
    for (let charIdx = 0; charIdx < html.length; charIdx++) {
        const char = html[charIdx];
        switch (mode) {
            case 'tag': {
                const atomicTag = (' ' === char || '/' === char || '>' === char) ? isStartOfAtomicTag(currentWord) : false;
                const styleTag = isStartOfStyleTag(currentWord + char);
                const latestStyleTag = currentStyleTags.length && currentStyleTags[currentStyleTags.length - 1];
                const endOfStyleTag = isEndOfTag(char) && latestStyleTag && isEndOfStyleTag(currentWord, latestStyleTag);
                const tableTag = isStartOfTableTag(currentWord + char);
                const latestTableTag = currentTableTags.length && currentTableTags[currentTableTags.length - 1];
                const endOfTableTag = isEndOfTag(char) && latestTableTag && isEndOfTableTag(currentWord, latestTableTag);
                if (styleTag) {
                    currentStyleTags.push(styleTag);
                    currentWord = '';
                    mode = 'char';
                }
                else if (endOfStyleTag) {
                    currentStyleTags.pop();
                    currentWord = '';
                    mode = 'char';
                }
                else if (tableTag) {
                    currentTableTags.push(tableTag);
                    currentWord += char;
                    words.push(createToken(currentWord, currentStyleTags, currentTableTags));
                    currentWord = '';
                    mode = 'char';
                }
                else if (endOfTableTag) {
                    currentTableTags.pop();
                    currentWord += '>';
                    words.push(createToken(currentWord, currentStyleTags, currentTableTags));
                    currentWord = '';
                    mode = 'char';
                }
                else if (atomicTag) {
                    mode = 'atomic_tag';
                    currentAtomicTag = atomicTag;
                    currentWord += char;
                }
                else if (isStartOfHTMLComment(currentWord)) {
                    mode = 'html_comment';
                    currentWord += char;
                }
                else if (isEndOfTag(char)) {
                    currentWord += '>';
                    words.push(createToken(currentWord, currentStyleTags, currentTableTags));
                    currentWord = '';
                    if (isWhitespace(char)) {
                        mode = 'whitespace';
                    }
                    else {
                        mode = 'char';
                    }
                }
                else {
                    currentWord += char;
                }
                break;
            }
            case 'atomic_tag':
                if (isEndOfTag(char) && (isImage(currentWord + '>') || isEndOfAtomicTag(currentWord, currentAtomicTag))) {
                    currentWord += '>';
                    words.push(createToken(currentWord, currentStyleTags, currentTableTags));
                    currentWord = '';
                    currentAtomicTag = '';
                    mode = 'char';
                }
                else {
                    currentWord += char;
                }
                break;
            case 'html_comment':
                currentWord += char;
                if (isEndOfHTMLComment(currentWord)) {
                    currentWord = '';
                    mode = 'char';
                }
                break;
            case 'char':
                if (isStartOfTag(char)) {
                    if (currentWord) {
                        words.push(...splitStringLocaleAwareAndCreateTokens(currentWord, currentStyleTags, currentTableTags));
                    }
                    currentWord = '<';
                    mode = 'tag';
                }
                else if (/\s/.test(char)) {
                    if (currentWord) {
                        words.push(...splitStringLocaleAwareAndCreateTokens(currentWord, currentStyleTags, currentTableTags));
                    }
                    currentWord = char;
                    mode = 'whitespace';
                }
                else if (/&/.test(char)) {
                    if (currentWord) {
                        words.push(...splitStringLocaleAwareAndCreateTokens(currentWord, currentStyleTags, currentTableTags));
                    }
                    currentWord = char;
                    mode = 'escape_sequence';
                }
                // The regex was originally [\w\d#@] which did not match e.g. 'ö' or other non-ASCII characters used as letters.
                // -> Use "\p{L}\p{M}" instead, see e.g. https://stackoverflow.com/a/6005511/3740047
                // The \p{M} matches marks (e.g. accents above letters).
                // \w also matches "_" but \p{L} does not, so we include it now explicitly.
                // Moreover, we include "'" so that words like "don't" are not split.
                // The original code also matched numbers (via \d), so we include the more general \p{N} as well.
                // Documentation of the \p argument: https://unicode.org/reports/tr18/#General_Category_Property
                // Playground: https://regex101.com/r/sNbfSj/1
                else if (/[\p{N}\p{L}\p{M}_'@]/u.test(char)) {
                    currentWord += char;
                }
                else {
                    currentWord += char;
                    words.push(...splitStringLocaleAwareAndCreateTokens(currentWord, currentStyleTags, currentTableTags));
                    currentWord = '';
                }
                break;
            case 'whitespace':
                if (isStartOfTag(char)) {
                    if (currentWord) {
                        words.push(createToken(currentWord, currentStyleTags, currentTableTags));
                    }
                    currentWord = '<';
                    mode = 'tag';
                }
                else if (isWhitespace(char)) {
                    currentWord += char;
                }
                else {
                    if (currentWord) {
                        words.push(createToken(currentWord, currentStyleTags, currentTableTags));
                    }
                    currentWord = '';
                    charIdx--; // seek back
                    mode = 'char';
                }
                break;
            case 'escape_sequence':
                if (char === ';') {
                    currentWord += char;
                    words.push(createToken(currentWord, currentStyleTags, currentTableTags));
                    currentWord = '';
                    mode = 'char';
                }
                else if (/[\w\d#]/.test(char)) {
                    currentWord += char;
                }
                else {
                    // Not a valid escape sequence.
                    charIdx--; // seek back
                    mode = 'char';
                }
                break;
            default:
                return exhaustive(mode);
        }
    }
    if (currentWord) {
        if (mode === 'char') {
            words.push(...splitStringLocaleAwareAndCreateTokens(currentWord, currentStyleTags, currentTableTags));
        }
        else {
            words.push(createToken(currentWord, currentStyleTags, currentTableTags));
        }
    }
    return words;
}
/**
 * Creates a key that should be used to match tokens. This is useful, for example, if we want
 * to consider two open tag tokens as equal, even if they don't have the same attributes. We
 * use a key instead of overwriting the token because we may want to render the original string
 * without losing the attributes.
 *
 * @param {string} token The token to create the key for.
 *
 * @return {string} The identifying key that should be used to match before and after tokens.
 */
function getKeyForToken(token) {
    var _a;
    // If the token is an image element, grab it's src attribute to include in the key.
    const img = /^<img.*src=['"]([^"']*)['"].*>$/.exec(token);
    if (img) {
        return `<img src="${img[1]}">`;
    }
    // If the token is an object element, grab it's data attribute to include in the key.
    const object = /^<object.*data=['"]([^"']*)['"]/.exec(token);
    if (object) {
        return `<object data="${object[1]}"></object>`;
    }
    // Treat the entire anchor as needing to be compared
    const anchor = /^<a.*href=['"]([^"']*)['"]/.exec(token);
    if (anchor) {
        return token;
    }
    // If it's a video, math or svg element, the entire token should be compared except the
    // data-uuid.
    if (/^<(svg|math|video)[\s>]/.test(token)) {
        const uuid = token.indexOf('data-uuid="');
        if (uuid !== -1) {
            const start = token.slice(0, uuid);
            const end = token.slice(uuid + 44);
            return start + end;
        }
        else {
            return token;
        }
    }
    // If the token is an iframe element, grab it's src attribute to include in it's key.
    const iframe = /^<iframe.*src=['"]([^"']*)['"].*>/.exec(token);
    if (iframe) {
        return `<iframe src="${iframe[1]}"></iframe>`;
    }
    // If the token is any other element, just grab the tag name.
    const tagName = /<([^\s>]+)[\s>]/.exec(token);
    if (tagName) {
        return `<${(_a = tagName[1]) === null || _a === void 0 ? void 0 : _a.toLowerCase()}>`;
    }
    // Otherwise, the token is text, collapse the whitespace.
    if (token) {
        return token.replace(/(\s+|&nbsp;|&#160;)/g, ' ');
    }
    return token;
}
/**
 * Checks if a given token is image
 *
 * @param {} token
 * @returns
 */
function isImage(token) {
    return /^<img.*src=['"]([^"']*)['"].*>$/.exec(token);
}
const tokenMapKey = (token) => token.key + JSON.stringify(token.styles) + JSON.stringify(token.tableTags);
/**
 * Creates a map from token key to an array of indices of locations of the matching token in
 * the list of all tokens.
 *
 * @param {Array.<string>} tokens The list of tokens to be mapped.
 *
 * @return {Object} A mapping that can be used to search for tokens.
 */
function createMap(tokens) {
    return tokens.reduce(function (map, token, index) {
        var _a;
        if (map[tokenMapKey(token)]) {
            (_a = map[tokenMapKey(token)]) === null || _a === void 0 ? void 0 : _a.push(index);
        }
        else {
            map[tokenMapKey(token)] = [index];
        }
        return map;
    }, {});
}
/**
 * Compares two match objects to determine if the second match object comes before or after the
 * first match object. Returns -1 if the m2 should come before m1. Returns 1 if m1 should come
 * before m2. If the two matches criss-cross each other, a null is returned.
 *
 * @param {Match} m1 The first match object to compare.
 * @param {Match} m2 The second match object to compare.
 *
 * @return {number} Returns -1 if the m2 should come before m1. Returns 1 if m1 should come
 *    before m2. If the two matches criss-cross each other, 0 is returned.
 */
function compareMatches(m1, m2) {
    if (m2.endInBefore < m1.startInBefore && m2.endInAfter < m1.startInAfter) {
        return -1;
    }
    else if (m2.startInBefore > m1.endInBefore && m2.startInAfter > m1.endInAfter) {
        return 1;
    }
    else {
        return 0;
    }
}
function addToNode(node, match) {
    if (node) {
        const position = compareMatches(node.value, match);
        if (position === -1) {
            return {
                value: node.value,
                left: addToNode(node.left, match),
                right: node.right
            };
        }
        else if (position === 1) {
            return {
                value: node.value,
                left: node.left,
                right: addToNode(node.right, match)
            };
        }
        else {
            return node;
        }
    }
    else {
        return {
            value: match,
            left: null,
            right: null
        };
    }
}
function nodeToArray(node) {
    function inOrder(n, ns) {
        if (n) {
            inOrder(n.left, ns);
            ns.push(n.value);
            inOrder(n.right, ns);
        }
        return ns;
    }
    return inOrder(node, []);
}
/**
 * Finds and returns the best match between the before and after arrays contained in the segment
 * provided.
 *
 * @param {Segment} segment The segment in which to look for a match.
 *
 * @return {Match} The best match.
 */
function findBestMatch(segment) {
    const beforeTokens = segment.beforeTokens;
    const afterMap = segment.afterMap;
    let lastSpace = null;
    let bestMatch;
    // Iterate through the entirety of the beforeTokens to find the best match.
    for (let beforeIndex = 0; beforeIndex < beforeTokens.length; beforeIndex++) {
        let lookBehind = false;
        // If the current best match is longer than the remaining tokens, we can bail because we
        // won't find a better match.
        const remainingTokens = beforeTokens.length - beforeIndex;
        if (bestMatch && remainingTokens < bestMatch.length) {
            break;
        }
        // If the current token is whitespace, make a note of it and move on. Trying to start a
        // set of matches with whitespace is not efficient because it's too prevelant in most
        // documents. Instead, if the next token yields a match, we'll see if the whitespace can
        // be included in that match.
        const beforeToken = beforeTokens[beforeIndex];
        if ((beforeToken === null || beforeToken === void 0 ? void 0 : beforeToken.key) === ' ') {
            lastSpace = beforeIndex;
            continue;
        }
        // Check to see if we just skipped a space, if so, we'll ask getFullMatch to look behind
        // by one token to see if it can include the whitespace.
        if (lastSpace === beforeIndex - 1) {
            lookBehind = true;
        }
        // If the current token is not found in the afterTokens, it won't match and we can move
        // on.
        const afterTokenLocations = beforeToken && afterMap[tokenMapKey(beforeToken)];
        if (!afterTokenLocations) {
            continue;
        }
        // For each instance of the current token in afterTokens, let's see how big of a match
        // we can build.
        afterTokenLocations.forEach(function (afterIndex) {
            // getFullMatch will see how far the current token match will go in both
            // beforeTokens and afterTokens.
            const bestMatchLength = bestMatch ? bestMatch.length : 0;
            const m = getFullMatch(segment, beforeIndex, afterIndex, bestMatchLength, lookBehind);
            // If we got a new best match, we'll save it aside.
            if (m && m.length > bestMatchLength) {
                bestMatch = m;
            }
        });
    }
    return bestMatch;
}
/**
 * Takes the start of a match, and expands it in the beforeTokens and afterTokens of the
 * current segment as far as it can go.
 *
 * @param {Segment} segment The segment object to search within when expanding the match.
 * @param {number} beforeStart The offset within beforeTokens to start looking.
 * @param {number} afterStart The offset within afterTokens to start looking.
 * @param {number} minLength The minimum length match that must be found.
 * @param {boolean} lookBehind If true, attempt to match a whitespace token just before the
 *    beforeStart and afterStart tokens.
 *
 * @return {Match} The full match.
 */
function getFullMatch(segment, beforeStart, afterStart, minLength, lookBehind) {
    var _a, _b, _c, _d, _e, _f;
    const beforeTokens = segment.beforeTokens;
    const afterTokens = segment.afterTokens;
    // If we already have a match that goes to the end of the document, no need to keep looking.
    const minBeforeIndex = beforeStart + minLength;
    const minAfterIndex = afterStart + minLength;
    if (minBeforeIndex >= beforeTokens.length || minAfterIndex >= afterTokens.length) {
        return null;
    }
    // If a minLength was provided, we can do a quick check to see if the tokens after that
    // length match. If not, we won't be beating the previous best match, and we can bail out
    // early.
    if (minLength) {
        const nextBeforeWord = (_a = beforeTokens[minBeforeIndex]) === null || _a === void 0 ? void 0 : _a.key;
        const nextAfterWord = (_b = afterTokens[minAfterIndex]) === null || _b === void 0 ? void 0 : _b.key;
        if (nextBeforeWord !== nextAfterWord) {
            return null;
        }
    }
    // Extend the current match as far forward as it can go, without overflowing beforeTokens or
    // afterTokens.
    let searching = true;
    let currentLength = 1;
    let beforeIndex = beforeStart + currentLength;
    let afterIndex = afterStart + currentLength;
    while (searching && beforeIndex < beforeTokens.length && afterIndex < afterTokens.length) {
        const beforeWord = getTextToCompare(beforeIndex, beforeTokens);
        const afterWord = getTextToCompare(afterIndex, afterTokens);
        const beforeStyle = JSON.stringify((_c = beforeTokens[beforeIndex]) === null || _c === void 0 ? void 0 : _c.styles);
        const afterStyle = JSON.stringify((_d = afterTokens[afterIndex]) === null || _d === void 0 ? void 0 : _d.styles);
        if (beforeWord === afterWord && beforeStyle === afterStyle) {
            currentLength++;
            beforeIndex = beforeStart + currentLength;
            afterIndex = afterStart + currentLength;
        }
        else {
            searching = false;
        }
    }
    // If we've been asked to look behind, it's because both beforeTokens and afterTokens may
    // have a whitespace token just behind the current match that was previously ignored. If so,
    // we'll expand the current match to include it.
    if (lookBehind && beforeStart > 0 && afterStart > 0) {
        const prevBeforeKey = (_e = beforeTokens[beforeStart - 1]) === null || _e === void 0 ? void 0 : _e.key;
        const prevAfterKey = (_f = afterTokens[afterStart - 1]) === null || _f === void 0 ? void 0 : _f.key;
        if (prevBeforeKey === ' ' && prevAfterKey === ' ') {
            beforeStart--;
            afterStart--;
            currentLength++;
        }
    }
    return makeMatch(beforeStart, afterStart, currentLength, segment);
}
function getTextToCompare(index, tokens) {
    const token = tokens[index];
    if (!token) {
        throw Error(`Expected the tokens to have an element at position ${index}`);
    }
    if (isStartOfAtomicTag(token.key)) {
        return token.str;
    }
    else {
        return token.key;
    }
}
/**
 * Creates segment objects from the original document that can be used to restrict the area that
 * findBestMatch and it's helper functions search to increase performance.
 *
 * @param {Array.<Token>} beforeTokens Tokens from the before document.
 * @param {Array.<Token>} afterTokens Tokens from the after document.
 * @param {number} beforeIndex The index within the before document where this segment begins.
 * @param {number} afterIndex The index within the after document where this segment behinds.
 *
 * @return {Segment} The segment object.
 */
function createSegment(beforeTokens, afterTokens, beforeIndex, afterIndex) {
    return {
        beforeTokens: beforeTokens,
        afterTokens: afterTokens,
        beforeMap: createMap(beforeTokens),
        afterMap: createMap(afterTokens),
        beforeIndex: beforeIndex,
        afterIndex: afterIndex
    };
}
/**
 * Finds all the matching blocks within the given segment in the before and after lists of
 * tokens.
 *
 * @param {Segment} The segment that should be searched for matching blocks.
 *
 * @return {Array.<Match>} The list of matching blocks in this range.
 */
function findMatchingBlocks(segment) {
    // Create a binary search tree to hold the matches we find in order.
    let matches = null;
    let match;
    const segments = [segment];
    let currSegment;
    // Each time the best match is found in a segment, zero, one or two new segments may be
    // created from the parts of the original segment not included in the match. We will
    // continue to iterate until all segments have been processed.
    while (segments.length) {
        currSegment = segments.pop();
        if (currSegment) {
            match = findBestMatch(currSegment);
            if (match && match.length) {
                // If there's an unmatched area at the start of the segment, create a new segment
                // from that area and throw it into the segments array to get processed.
                if (match.segmentStartInBefore > 0 && match.segmentStartInAfter > 0) {
                    const leftBeforeTokens = currSegment.beforeTokens.slice(0, match.segmentStartInBefore);
                    const leftAfterTokens = currSegment.afterTokens.slice(0, match.segmentStartInAfter);
                    segments.push(createSegment(leftBeforeTokens, leftAfterTokens, currSegment.beforeIndex, currSegment.afterIndex));
                }
                // If there's an unmatched area at the end of the segment, create a new segment from that
                // area and throw it into the segments array to get processed.
                const rightBeforeTokens = currSegment.beforeTokens.slice(match.segmentEndInBefore + 1);
                const rightAfterTokens = currSegment.afterTokens.slice(match.segmentEndInAfter + 1);
                const rightBeforeIndex = currSegment.beforeIndex + match.segmentEndInBefore + 1;
                const rightAfterIndex = currSegment.afterIndex + match.segmentEndInAfter + 1;
                if (rightBeforeTokens.length && rightAfterTokens.length) {
                    segments.push(createSegment(rightBeforeTokens, rightAfterTokens, rightBeforeIndex, rightAfterIndex));
                }
                matches = addToNode(matches, match);
            }
        }
    }
    return nodeToArray(matches);
}
/**
 * Gets a list of operations required to transform the before list of tokens into the
 * after list of tokens. An operation describes whether a particular list of consecutive
 * tokens are equal, replaced, inserted, or deleted.
 *
 * @param {Array.<string>} beforeTokens The before list of tokens.
 * @param {Array.<string>} afterTokens The after list of tokens.
 *
 * @return {Array.<Object>} The list of operations to transform the before list of
 *      tokens into the after list of tokens, where each operation has the following
 *      keys:
 *      - {string} action One of {'replace', 'insert', 'delete', 'equal'}.
 *      - {number} startInBefore The beginning of the range in the list of before tokens.
 *      - {number} endInBefore The end of the range in the list of before tokens.
 *      - {number} startInAfter The beginning of the range in the list of after tokens.
 *      - {number} endInAfter The end of the range in the list of after tokens.
 */
function calculateOperations(beforeTokens, afterTokens) {
    if (!beforeTokens)
        throw new Error('Missing beforeTokens');
    if (!afterTokens)
        throw new Error('Missing afterTokens');
    let positionInBefore = 0;
    let positionInAfter = 0;
    const operations = [];
    const segment = createSegment(beforeTokens, afterTokens, 0, 0);
    const matches = findMatchingBlocks(segment);
    matches.push(makeMatch(beforeTokens.length, afterTokens.length, 0, segment));
    matches.forEach(match => {
        let actionUpToMatchPositions = 'none';
        if (positionInBefore === match.startInBefore) {
            if (positionInAfter !== match.startInAfter) {
                actionUpToMatchPositions = 'insert';
            }
        }
        else {
            actionUpToMatchPositions = 'delete';
            if (positionInAfter !== match.startInAfter) {
                actionUpToMatchPositions = 'replace';
            }
        }
        if (actionUpToMatchPositions !== 'none') {
            operations.push({
                action: actionUpToMatchPositions,
                startInBefore: positionInBefore,
                endInBefore: (actionUpToMatchPositions !== 'insert' ?
                    match.startInBefore - 1 : undefined),
                startInAfter: positionInAfter,
                endInAfter: (actionUpToMatchPositions !== 'delete' ?
                    match.startInAfter - 1 : undefined)
            });
        }
        if (match.length !== 0) {
            operations.push({
                action: 'equal',
                startInBefore: match.startInBefore,
                endInBefore: match.endInBefore,
                startInAfter: match.startInAfter,
                endInAfter: match.endInAfter
            });
        }
        positionInBefore = match.endInBefore + 1;
        positionInAfter = match.endInAfter + 1;
    });
    const postProcessed = [];
    let lastOp = { action: 'none' };
    function isSingleWhitespace(op) {
        if (op.action !== 'equal') {
            return false;
        }
        else if (!op.endInBefore) {
            return false;
        }
        else if (op.endInBefore - op.startInBefore !== 0) {
            return false;
        }
        const slice = beforeTokens.slice(op.startInBefore, op.endInBefore + 1);
        const str = slice.map(t => t.str).join('');
        return /^\s$/.test(str);
    }
    operations.forEach(op => {
        if ((lastOp.action === 'replace' && isSingleWhitespace(op)) ||
            (op.action === 'replace' && lastOp.action === 'replace')) {
            // lastOp.endInBefore = op.endInBefore;
            // lastOp.endInAfter = op.endInAfter;
        }
        else {
            postProcessed.push(op);
            lastOp = op;
        }
    });
    return postProcessed;
}
function TokenWrapper(tokens) {
    return {
        tokens: tokens,
        notes: tokens.map(token => token.str).reduce(function (data, token, index) {
            data.notes.push({
                isWrappable: isWrappable(token),
                insertedTag: false
            });
            const tag = !isVoidTag(token) && isTag(token);
            const lastEntry = data.tagStack[data.tagStack.length - 1];
            if (tag) {
                if (lastEntry && '/' + lastEntry.tag === tag) {
                    data.notes[lastEntry.position].insertedTag = true;
                    data.tagStack.pop();
                }
                else {
                    data.tagStack.push({
                        tag: tag,
                        position: index
                    });
                }
            }
            return data;
        }, { notes: [], tagStack: [] }).notes
    };
}
/**
 * Wraps the contained tokens in tags based on output given by a map function. Each segment of
 * tokens will be visited. A segment is a continuous run of either all wrappable
 * tokens or unwrappable tokens. The given map function will be called with each segment of
 * tokens and the resulting strings will be combined to form the wrapped HTML.
 *
 * @param {function(boolean, Array.<string>)} mapFn A function called with an array of tokens
 *      and whether those tokens are wrappable or not. The result should be a string.
 */
function combineTokenNotes(mapFn, tagFn, tokenNotes) {
    const notes = tokenNotes.notes;
    const tokens = tokenNotes.tokens.slice();
    const segments = tokens.reduce(function (data, token, index) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        if ((_a = notes[index]) === null || _a === void 0 ? void 0 : _a.insertedTag) {
            tokens[index] = {
                key: ((_b = tokens[index]) === null || _b === void 0 ? void 0 : _b.key) || '',
                str: tagFn((_c = tokens[index]) === null || _c === void 0 ? void 0 : _c.str),
                styles: ((_d = tokens[index]) === null || _d === void 0 ? void 0 : _d.styles) || [],
                tableTags: ((_e = tokens[index]) === null || _e === void 0 ? void 0 : _e.tableTags) || []
            };
        }
        if (data.status === null) {
            data.status = (_g = (_f = notes[index]) === null || _f === void 0 ? void 0 : _f.isWrappable) !== null && _g !== void 0 ? _g : false;
        }
        const status = (_j = (_h = notes[index]) === null || _h === void 0 ? void 0 : _h.isWrappable) !== null && _j !== void 0 ? _j : false;
        if (status !== data.status) {
            data.list.push({
                isWrappable: data.status,
                tokens: tokens.slice(data.lastIndex, index)
            });
            data.lastIndex = index;
            data.status = status;
        }
        if (index === tokens.length - 1) {
            data.list.push({
                isWrappable: data.status,
                tokens: tokens.slice(data.lastIndex, index + 1)
            });
        }
        return data;
    }, { list: [], status: null, lastIndex: 0 }).list;
    return segments.map(mapFn).join('');
}
function arrayDiff(a1, a2) {
    let beforeArray = [];
    let afterArray = [];
    let isDiff = false;
    while (a1.length && a2.length) {
        const curr1 = a1.shift();
        const curr2 = a2.shift();
        if (curr1 !== curr2 || isDiff) {
            isDiff = true;
            if (curr1)
                beforeArray.push(curr1);
            if (curr2)
                afterArray.push(curr2);
        }
    }
    beforeArray = [...beforeArray, ...a1];
    afterArray = [...afterArray, ...a2];
    return ({
        before: beforeArray,
        after: afterArray,
    });
}
function closeStyles(p) {
    var _a;
    let currentContent = p.content;
    const styles = [...p.styles];
    while (styles.length) {
        currentContent += `</${(_a = styles.pop()) === null || _a === void 0 ? void 0 : _a.tag}>`;
    }
    return currentContent;
}
function reduceTokens(tokens) {
    return closeStyles(tokens.reduce((acc, curr) => {
        let currContent = acc.content;
        const { before, after } = arrayDiff([...acc.styles], [...curr.styles]);
        before.forEach(() => {
            const tag = acc.styles.pop();
            if (tag) {
                currContent += `</${tag.tag}>`;
            }
        });
        after.forEach((tag) => {
            acc.styles.push(tag);
            currContent += `<${tag.tagWithAttributes}>`;
        });
        currContent += curr.str;
        return ({ content: currContent, styles: acc.styles });
    }, { content: '', styles: [] }));
}
/**
 * Wraps and concatenates a list of tokens with a tag. Does not wrap tag tokens,
 * unless they are wrappable (i.e. void and atomic tags).
 *
 * @param {sting} tag The tag name of the wrapper tags.
 * @param {Array.<string>} content The list of tokens to wrap.
 * @param {string} dataPrefix (Optional) The prefix to use in data attributes.
 * @param {string} className (Optional) The class name to include in the wrapper tag.
 */
function wrap(tag, content, opIndex, dataPrefix, className) {
    const wrapper = TokenWrapper(content);
    dataPrefix = dataPrefix ? dataPrefix + '-' : '';
    let attrs = ` data-${dataPrefix}operation-index="${opIndex}"`;
    if (className) {
        attrs += ' class="' + className + '"';
    }
    return combineTokenNotes(function (segment) {
        if (segment.isWrappable) {
            const val = reduceTokens(segment.tokens);
            if (val.trim()) {
                return '<' + tag + attrs + '>' + val + '</' + tag + '>';
            }
        }
        else {
            return reduceTokens(segment.tokens);
        }
        return '';
    }, function (openingTag) {
        let dataAttrs = ' data-diff-node="' + tag + '"';
        dataAttrs += ` data-${dataPrefix}operation-index="${opIndex}"`;
        return openingTag ? openingTag.replace(/>\s*$/, dataAttrs + '$&') : '';
    }, wrapper);
}
/**
 * OPS.equal/insert/delete/replace are functions that render an operation into
 * HTML content.
 *
 * @param {Object} op The operation that applies to a prticular list of tokens. Has the
 *      following keys:
 *      - {string} action One of ['replace', 'insert', 'delete', 'equal'].
 *      - {number} startInBefore The beginning of the range in the list of before tokens.
 *      - {number} endInBefore The end of the range in the list of before tokens.
 *      - {number} startInAfter The beginning of the range in the list of after tokens.
 *      - {number} endInAfter The end of the range in the list of after tokens.
 * @param {Array.<string>} beforeTokens The before list of tokens.
 * @param {Array.<string>} afterTokens The after list of tokens.
 * @param {number} opIndex The index into the list of operations that identifies the change to
 *      be rendered. This is used to mark wrapped HTML as part of the same operation.
 * @param {string} dataPrefix (Optional) The prefix to use in data attributes.
 * @param {string} className (Optional) The class name to include in the wrapper tag.
 *
 * @return {string} The rendering of that operation.
 */
const OPS = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    'equal': function (op, beforeTokens, afterTokens, opIndex, dataPrefix, className) {
        const tokens = op.endInAfter ?
            afterTokens.slice(op.startInAfter, op.endInAfter + 1) :
            afterTokens.slice(op.startInAfter, 1);
        return reduceTokens(tokens);
    },
    'insert': function (op, beforeTokens, afterTokens, opIndex, dataPrefix, className) {
        const tokens = op.endInAfter ?
            afterTokens.slice(op.startInAfter, op.endInAfter + 1) :
            afterTokens.slice(op.startInAfter, 1);
        return wrap('ins', tokens, opIndex, dataPrefix, className);
    },
    'delete': function (op, beforeTokens, afterTokens, opIndex, dataPrefix, className) {
        const tokens = op.endInBefore ?
            beforeTokens.slice(op.startInBefore, op.endInBefore + 1) :
            beforeTokens.slice(op.startInBefore, 1);
        return wrap('del', tokens, opIndex, dataPrefix, className);
    },
    'replace': function (op, beforeTokens, afterTokens, opIndex, dataPrefix, className) {
        return OPS.delete.apply(null, [op, beforeTokens, afterTokens, opIndex, dataPrefix, className])
            + OPS.insert.apply(null, [op, beforeTokens, afterTokens, opIndex, dataPrefix, className]);
    }
};
/**
 * Renders a list of operations into HTML content. The result is the combined version
 * of the before and after tokens with the differences wrapped in tags.
 *
 * @param {Array.<string>} beforeTokens The before list of tokens.
 * @param {Array.<string>} afterTokens The after list of tokens.
 * @param {Array.<Object>} operations The list of operations to transform the before
 *      list of tokens into the after list of tokens, where each operation has the
 *      following keys:
 *      - {string} action One of {'replace', 'insert', 'delete', 'equal'}.
 *      - {number} startInBefore The beginning of the range in the list of before tokens.
 *      - {number} endInBefore The end of the range in the list of before tokens.
 *      - {number} startInAfter The beginning of the range in the list of after tokens.
 *      - {number} endInAfter The end of the range in the list of after tokens.
 * @param {string} dataPrefix (Optional) The prefix to use in data attributes.
 * @param {string} className (Optional) The class name to include in the wrapper tag.
 *
 * @return {string} The rendering of the list of operations.
 */
function renderOperations(beforeTokens, afterTokens, operations, dataPrefix, className) {
    return operations.reduce(function (rendering, op, index) {
        return rendering + OPS[op.action](op, beforeTokens, afterTokens, index, dataPrefix, className);
    }, '');
}
/**
 * Compares two pieces of HTML content and returns the combined content with differences
 * wrapped in <ins> and <del> tags.
 *
 * @param {string} before The HTML content before the changes.
 * @param {string} after The HTML content after the changes.
 * @param {string} className (Optional) The class attribute to include in <ins> and <del> tags.
 * @param {string} dataPrefix (Optional) The data prefix to use for data attributes. The
 *      operation index data attribute will be named `data-${dataPrefix-}operation-index`.
 *
 * @return {string} The combined HTML content with differences wrapped in <ins> and <del> tags.
 */
function diffWithViews(before, after, className, dataPrefix) {
    if (!before && !after) {
        return { diffHtml: '', leftHtml: '', rightHtml: '' };
    }
    if (!before) {
        const inserted = wrap('ins', htmlToTokens(after), 0, dataPrefix, className);
        return { diffHtml: inserted, leftHtml: '', rightHtml: inserted };
    }
    if (!after) {
        const deleted = wrap('del', htmlToTokens(before), 0, dataPrefix, className);
        return { diffHtml: deleted, leftHtml: deleted, rightHtml: '' };
    }
    if (before === after) {
        return { diffHtml: before, leftHtml: before, rightHtml: after };
    }
    const beforeTokens = htmlToTokens(before.replace(/<br>/g, '<br></br>').replace(/<\s*hr([^>]*)>/, '<hr$1></hr>'));
    const afterTokens = htmlToTokens(after.replace(/<br>/g, '<br></br>').replace(/<\s*hr([^>]*)>/, '<hr$1></hr>'));
    const ops = calculateOperations(beforeTokens, afterTokens);
    const clean = html => html.replace(/<\/br>/g, '').replace(/<\/hr>/g, '');
    // Render each side from its own tokens. Removing markup from the unified diff
    // cannot reliably reconstruct list/table boundaries or preserve native ins/del.
    function renderSide(tokens, side, excludedAction, tag) {
        return clean(ops.map((op, index) => {
            if (op.action === excludedAction) return '';
            const start = side === 'before' ? op.startInBefore : op.startInAfter;
            const end = side === 'before' ? op.endInBefore : op.endInAfter;
            const slice = tokens.slice(start, end + 1);
            return op.action === 'equal' ? reduceTokens(slice) : wrap(tag, slice, index, dataPrefix, className);
        }).join(''));
    }
    return {
        diffHtml: clean(renderOperations(beforeTokens, afterTokens, ops, dataPrefix, className)),
        leftHtml: renderSide(beforeTokens, 'before', 'insert', 'del'),
        rightHtml: renderSide(afterTokens, 'after', 'delete', 'ins')
    };
}

function diff(before, after, className, dataPrefix) {
    return diffWithViews(before, after, className, dataPrefix).diffHtml;
}
diff.withViews = diffWithViews;

  return diff;
}));
