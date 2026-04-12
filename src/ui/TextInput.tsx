import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { applyTextInputKey, createTextInputState } from "./text-input-state.ts";

interface TextInputProps {
  prompt: string;
  onSubmit: (value: string) => void;
  active?: boolean;
  history?: string[];
}

export function TextInput({ prompt, onSubmit, active = true, history = [] }: TextInputProps) {
  const [state, setState] = useState(createTextInputState);

  useInput(
    (input, key) => {
      if (key.return) {
        const submitted = state.value;
        setState(createTextInputState());
        onSubmit(submitted);
        return;
      }

      setState((current) => applyTextInputKey(current, input, key, history).state);
    },
    { isActive: active },
  );

  const beforeCursor = state.value.slice(0, state.cursor);
  const hasCharacterAtCursor = state.cursor < state.value.length;
  const cursorCharacter = hasCharacterAtCursor ? state.value[state.cursor] : undefined;
  const afterCursor = hasCharacterAtCursor ? state.value.slice(state.cursor + 1) : "";

  return (
    <Box>
      <Text dimColor>{prompt}</Text>
      <Text>{beforeCursor}</Text>
      {active && hasCharacterAtCursor && cursorCharacter !== undefined ? (
        <Text inverse>{cursorCharacter}</Text>
      ) : (
        <Text>{hasCharacterAtCursor ? cursorCharacter : ""}</Text>
      )}
      <Text>{afterCursor}</Text>
      {active && !hasCharacterAtCursor && <Text color="gray">█</Text>}
    </Box>
  );
}
