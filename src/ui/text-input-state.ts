export interface TextInputState {
  value: string;
  cursor: number;
  historyIndex: number;
  savedInput: string;
}

export interface TextInputKey {
  return: boolean;
  backspace: boolean;
  delete: boolean;
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  home: boolean;
  end: boolean;
  ctrl: boolean;
  meta: boolean;
  tab: boolean;
  escape: boolean;
}

export interface TextInputResult {
  state: TextInputState;
  submit?: string;
  clearScreen?: boolean;
}

const INITIAL_STATE: TextInputState = {
  value: "",
  cursor: 0,
  historyIndex: -1,
  savedInput: "",
};

export function createTextInputState(): TextInputState {
  return { ...INITIAL_STATE };
}

export function applyTextInputKey(
  state: TextInputState,
  input: string,
  key: TextInputKey,
  history: string[],
): TextInputResult {
  if (key.return) {
    return {
      state: createTextInputState(),
      submit: state.value,
    };
  }

  if (key.ctrl && input === "l") {
    return {
      state,
      clearScreen: true,
    };
  }

  if (key.upArrow || (key.ctrl && input === "p")) {
    return { state: browseHistoryUp(state, history) };
  }

  if (key.downArrow || (key.ctrl && input === "n")) {
    return { state: browseHistoryDown(state, history) };
  }

  if (key.leftArrow) {
    return { state: key.meta || key.ctrl ? moveCursorWordLeft(state) : moveCursorLeft(state) };
  }

  if (key.rightArrow) {
    return { state: key.meta || key.ctrl ? moveCursorWordRight(state) : moveCursorRight(state) };
  }

  if (key.home || (key.ctrl && input === "a")) {
    return { state: moveCursorToStart(state) };
  }

  if (key.end || (key.ctrl && input === "e")) {
    return { state: moveCursorToEnd(state) };
  }

  if (key.backspace) {
    return { state: key.meta || key.ctrl ? deleteWordBackward(state) : deleteBackward(state) };
  }

  if (key.delete) {
    return { state: key.meta || key.ctrl ? deleteWordForward(state) : deleteForward(state) };
  }

  if (key.ctrl) {
    switch (input) {
      case "b":
        return { state: moveCursorLeft(state) };
      case "f":
        return { state: moveCursorRight(state) };
      case "d":
        return { state: deleteForward(state) };
      case "w":
        return { state: deleteWordBackward(state) };
      case "u":
        return { state: deleteToLineStart(state) };
      case "k":
        return { state: deleteToLineEnd(state) };
      default:
        return { state };
    }
  }

  if (key.meta) {
    switch (input) {
      case "b":
        return { state: moveCursorWordLeft(state) };
      case "f":
        return { state: moveCursorWordRight(state) };
      case "d":
        return { state: deleteWordForward(state) };
      default:
        return { state };
    }
  }

  if (key.escape || key.tab) {
    return { state };
  }

  if (!input) {
    return { state };
  }

  return { state: insertText(state, input) };
}

function browseHistoryUp(state: TextInputState, history: string[]): TextInputState {
  if (history.length === 0) {
    return state;
  }

  const nextIndex = Math.min(state.historyIndex + 1, history.length - 1);
  const savedInput = state.historyIndex === -1 ? state.value : state.savedInput;
  const value = history[nextIndex] ?? "";

  return {
    value,
    cursor: value.length,
    historyIndex: nextIndex,
    savedInput,
  };
}

function browseHistoryDown(state: TextInputState, history: string[]): TextInputState {
  if (state.historyIndex <= -1) {
    return state;
  }

  const nextIndex = state.historyIndex - 1;
  if (nextIndex === -1) {
    return {
      value: state.savedInput,
      cursor: state.savedInput.length,
      historyIndex: -1,
      savedInput: state.savedInput,
    };
  }

  const value = history[nextIndex] ?? "";
  return {
    value,
    cursor: value.length,
    historyIndex: nextIndex,
    savedInput: state.savedInput,
  };
}

function moveCursorLeft(state: TextInputState): TextInputState {
  if (state.cursor === 0) {
    return state;
  }

  return moveState(state, state.cursor - 1);
}

function moveCursorRight(state: TextInputState): TextInputState {
  if (state.cursor >= state.value.length) {
    return state;
  }

  return moveState(state, state.cursor + 1);
}

function moveCursorToStart(state: TextInputState): TextInputState {
  return moveState(state, 0);
}

function moveCursorToEnd(state: TextInputState): TextInputState {
  return moveState(state, state.value.length);
}

function moveCursorWordLeft(state: TextInputState): TextInputState {
  return moveState(state, findWordStart(state.value, state.cursor));
}

function moveCursorWordRight(state: TextInputState): TextInputState {
  return moveState(state, findWordEnd(state.value, state.cursor));
}

function insertText(state: TextInputState, text: string): TextInputState {
  const nextValue = state.value.slice(0, state.cursor) + text + state.value.slice(state.cursor);

  return editState(state, nextValue, state.cursor + text.length);
}

function deleteBackward(state: TextInputState): TextInputState {
  if (state.cursor === 0) {
    return state;
  }

  const start = state.cursor - 1;
  return deleteRange(state, start, state.cursor, start);
}

function deleteForward(state: TextInputState): TextInputState {
  if (state.cursor >= state.value.length) {
    return state;
  }

  return deleteRange(state, state.cursor, state.cursor + 1, state.cursor);
}

function deleteWordBackward(state: TextInputState): TextInputState {
  const start = findWordStart(state.value, state.cursor);
  if (start === state.cursor) {
    return state;
  }

  return deleteRange(state, start, state.cursor, start);
}

function deleteWordForward(state: TextInputState): TextInputState {
  const end = findWordEnd(state.value, state.cursor);
  if (end === state.cursor) {
    return state;
  }

  return deleteRange(state, state.cursor, end, state.cursor);
}

function deleteToLineStart(state: TextInputState): TextInputState {
  if (state.cursor === 0) {
    return state;
  }

  return deleteRange(state, 0, state.cursor, 0);
}

function deleteToLineEnd(state: TextInputState): TextInputState {
  if (state.cursor >= state.value.length) {
    return state;
  }

  return deleteRange(state, state.cursor, state.value.length, state.cursor);
}

function deleteRange(
  state: TextInputState,
  start: number,
  end: number,
  cursor: number,
): TextInputState {
  const nextValue = state.value.slice(0, start) + state.value.slice(end);
  return editState(state, nextValue, cursor);
}

function editState(state: TextInputState, value: string, cursor: number): TextInputState {
  return {
    value,
    cursor,
    historyIndex: -1,
    savedInput: state.savedInput,
  };
}

function moveState(state: TextInputState, cursor: number): TextInputState {
  return {
    value: state.value,
    cursor,
    historyIndex: state.historyIndex,
    savedInput: state.savedInput,
  };
}

function findWordStart(value: string, cursor: number): number {
  let index = cursor;

  while (index > 0 && isWhitespace(value[index - 1])) {
    index--;
  }

  while (index > 0 && !isWhitespace(value[index - 1])) {
    index--;
  }

  return index;
}

function findWordEnd(value: string, cursor: number): number {
  let index = cursor;

  while (index < value.length && isWhitespace(value[index])) {
    index++;
  }

  while (index < value.length && !isWhitespace(value[index])) {
    index++;
  }

  return index;
}

function isWhitespace(char: string | undefined): boolean {
  return char != null && /\s/.test(char);
}
