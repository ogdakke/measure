import { useState, useRef } from "react";
import { Box, Text, useInput } from "ink";

interface TextInputProps {
  prompt: string;
  onSubmit: (value: string) => void;
  active?: boolean;
  history?: string[];
}

export function TextInput({ prompt, onSubmit, active = true, history = [] }: TextInputProps) {
  const [value, setValue] = useState("");
  // -1 means "not browsing history" (current input), 0 = most recent, 1 = second most recent, etc.
  const [historyIndex, setHistoryIndex] = useState(-1);
  // Save the in-progress input when user starts navigating history
  const savedInput = useRef("");

  useInput(
    (input, key) => {
      if (key.return) {
        const submitted = value;
        setValue("");
        setHistoryIndex(-1);
        savedInput.current = "";
        onSubmit(submitted);
        return;
      }

      if (key.backspace || key.delete) {
        setValue((v) => v.slice(0, -1));
        setHistoryIndex(-1);
        return;
      }

      if (key.upArrow) {
        if (history.length === 0) return;
        const newIndex = Math.min(historyIndex + 1, history.length - 1);
        if (historyIndex === -1) {
          savedInput.current = value;
        }
        setHistoryIndex(newIndex);
        setValue(history[newIndex]!);
        return;
      }

      if (key.downArrow) {
        if (historyIndex <= -1) return;
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        if (newIndex === -1) {
          setValue(savedInput.current);
        } else {
          setValue(history[newIndex]!);
        }
        return;
      }

      // Ignore control characters
      if (key.ctrl || key.meta || key.escape) return;
      if (key.leftArrow || key.rightArrow) return;
      if (key.tab) return;

      setValue((v) => v + input);
      setHistoryIndex(-1);
    },
    { isActive: active },
  );

  return (
    <Box>
      <Text dimColor>{prompt}</Text>
      <Text>{value}</Text>
      {active && <Text color="gray">█</Text>}
    </Box>
  );
}
