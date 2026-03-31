import React, { useEffect, useRef } from 'react';
import CodeMirror from 'codemirror';

import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/dracula.css';

// Language modes
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/python/python';
import 'codemirror/mode/clike/clike';        // C, C++, Java
import 'codemirror/mode/htmlmixed/htmlmixed';
import 'codemirror/mode/css/css';
import 'codemirror/mode/php/php';
import 'codemirror/mode/ruby/ruby';
import 'codemirror/mode/go/go';
import 'codemirror/mode/rust/rust';

import 'codemirror/addon/edit/closetag';
import 'codemirror/addon/edit/closebrackets';

// ─── Language config map ────────────────────────────────────────────────────
export const LANGUAGES = [
    { label: 'JavaScript', value: 'javascript', mode: { name: 'javascript', json: true } },
    { label: 'Python',     value: 'python',     mode: { name: 'python' } },
    { label: 'C++',        value: 'cpp',        mode: { name: 'text/x-c++src' } },
    { label: 'C',          value: 'c',          mode: { name: 'text/x-csrc' } },
    { label: 'Java',       value: 'java',       mode: { name: 'text/x-java' } },
    { label: 'HTML',       value: 'html',       mode: { name: 'htmlmixed' } },
    { label: 'CSS',        value: 'css',        mode: { name: 'css' } },
    { label: 'PHP',        value: 'php',        mode: { name: 'php' } },
    { label: 'Ruby',       value: 'ruby',       mode: { name: 'ruby' } },
    { label: 'Go',         value: 'go',         mode: { name: 'go' } },
    { label: 'Rust',       value: 'rust',       mode: { name: 'rust' } },
];

// Random colors assigned to each collaborator cursor
const CURSOR_COLORS = [
    '#e06c75', '#61afef', '#98c379', '#e5c07b',
    '#c678dd', '#56b6c2', '#ff8c69', '#a8e6cf',
];
const colorMap = {}; // socketId → color

function getCursorColor(socketId) {
    if (!colorMap[socketId]) {
        const idx = Object.keys(colorMap).length % CURSOR_COLORS.length;
        colorMap[socketId] = CURSOR_COLORS[idx];
    }
    return colorMap[socketId];
}

// ─── Editor Component ───────────────────────────────────────────────────────
function Editor({ socketRef, roomId, onCodeChange, language, onLanguageChange }) {
    const editorRef    = useRef(null);
    const cursorMarkers = useRef({}); // socketId → { bookmark, label }

    // ── Init CodeMirror ──
    useEffect(() => {
        const editor = CodeMirror.fromTextArea(
            document.getElementById('realTimeEditor'),
            {
                mode: LANGUAGES[0].mode,
                theme: 'dracula',
                autoCloseTags: true,
                autoCloseBrackets: true,
                lineNumbers: true,
            }
        );

        editor.setSize(null, '100%');
        editorRef.current = editor;

        // Emit code changes
        editor.on('change', (instance, changes) => {
            const { origin } = changes;
            const code = instance.getValue();
            onCodeChange(code);
            if (origin !== 'setValue') {
                socketRef.current.emit('code-change', { roomId, code });
            }
        });

        // FEATURE 3: Emit cursor position whenever it moves
        editor.on('cursorActivity', (instance) => {
            const cursor = instance.getCursor(); // { line, ch }
            socketRef.current?.emit('cursor-move', {
                roomId,
                cursor,
                username: socketRef.current._username, // set this in EditorPage
            });
        });

        return () => {
            editor.toTextArea();
        };
    }, []);

    // ── FEATURE 1: Update CodeMirror mode when language prop changes ──
    useEffect(() => {
        if (!editorRef.current || !language) return;
        const lang = LANGUAGES.find(l => l.value === language);
        if (lang) {
            editorRef.current.setOption('mode', lang.mode);
        }
    }, [language]);

    // ── Socket listeners ──
    useEffect(() => {
        if (!socketRef.current) return;

        // Incoming code from others
        socketRef.current.on('code-change', ({ code }) => {
            if (code !== null && editorRef.current) {
                if (editorRef.current.getValue() !== code) {
                    editorRef.current.setValue(code);
                }
            }
        });

        // FEATURE 1: Incoming language change from others
        socketRef.current.on('language-change', ({ language }) => {
            onLanguageChange(language); // lift up to EditorPage so selector UI updates too
        });

        // FEATURE 3: Incoming cursor from another user
        socketRef.current.on('cursor-move', ({ socketId, cursor, username }) => {
            if (!editorRef.current) return;

            const color = getCursorColor(socketId);

            // Remove old marker for this user if exists
            if (cursorMarkers.current[socketId]) {
                cursorMarkers.current[socketId].bookmark.clear();
                const old = cursorMarkers.current[socketId].label;
                if (old && old.parentNode) old.parentNode.removeChild(old);
            }

            // Create cursor element
            const cursorEl = document.createElement('span');
            cursorEl.style.cssText = `
                border-left: 2px solid ${color};
                height: 1.2em;
                display: inline-block;
                margin-left: -1px;
                position: relative;
                vertical-align: text-bottom;
            `;

            // Create label above cursor
            const labelEl = document.createElement('span');
            labelEl.textContent = username;
            labelEl.style.cssText = `
                position: absolute;
                top: -18px;
                left: 0;
                background: ${color};
                color: #fff;
                font-size: 10px;
                font-family: monospace;
                padding: 1px 5px;
                border-radius: 3px;
                white-space: nowrap;
                pointer-events: none;
                z-index: 10;
            `;
            cursorEl.appendChild(labelEl);

            // Place bookmark in editor
            const bookmark = editorRef.current.setBookmark(
                { line: cursor.line, ch: cursor.ch },
                { widget: cursorEl, insertLeft: true }
            );

            cursorMarkers.current[socketId] = { bookmark, label: labelEl };
        });

        // FEATURE 3: Remove cursor when user disconnects
        socketRef.current.on('cursor-remove', ({ socketId }) => {
            if (cursorMarkers.current[socketId]) {
                cursorMarkers.current[socketId].bookmark.clear();
                delete cursorMarkers.current[socketId];
                delete colorMap[socketId];
            }
        });

        return () => {
            socketRef.current?.off('code-change');
            socketRef.current?.off('language-change');
            socketRef.current?.off('cursor-move');
            socketRef.current?.off('cursor-remove');
        };
    }, [socketRef.current]);

    return (
        <div style={{ height: '100%' }}>
            <textarea id="realTimeEditor"></textarea>
        </div>
    );
}

export default Editor;