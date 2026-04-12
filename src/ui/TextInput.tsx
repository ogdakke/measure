import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { applyTextInputKey, createTextInputState } from "./text-input-state.ts";
import type { ReplSlashCommand } from "../repl/slash-commands.ts";
import {
  getReplSlashCommandMatches,
  getReplSlashCommandPrefill,
  getReplSlashCommandQuery,
  getReplSlashCommandSubmitValue,
} from "../repl/slash-commands.ts";

interface TextInputProps {
  prompt: string;
  onSubmit: (value: string) => void;
  active?: boolean;
  history?: string[];
  slashCommands?: ReplSlashCommand[];
}

export function shouldNavigateSlashMatches(
  historyIndex: number,
  hasSlashMatches: boolean,
  key: { upArrow: boolean; downArrow: boolean },
): boolean {
  return historyIndex === -1 && hasSlashMatches && (key.upArrow || key.downArrow);
}

export function TextInput({
  prompt,
  onSubmit,
  active = true,
  history = [],
  slashCommands = [],
}: TextInputProps) {
  const [state, setState] = useState(createTextInputState);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const slashQuery = getReplSlashCommandQuery(state.value);
  const slashMatches =
    slashQuery == null || slashCommands.length === 0
      ? []
      : getReplSlashCommandMatches(slashQuery, slashCommands);
  const activeSlashMatch = slashMatches[selectedSlashIndex] ?? slashMatches[0];

  useEffect(() => {
    if (slashMatches.length === 0) {
      setSelectedSlashIndex(0);
      return;
    }

    setSelectedSlashIndex((current) => Math.min(current, slashMatches.length - 1));
  }, [slashMatches.length]);

  useInput(
    (input, key) => {
      if (shouldNavigateSlashMatches(state.historyIndex, slashMatches.length > 0, key)) {
        setSelectedSlashIndex((current) => {
          if (key.upArrow) {
            return current <= 0 ? slashMatches.length - 1 : current - 1;
          }

          return current >= slashMatches.length - 1 ? 0 : current + 1;
        });
        return;
      }

      if (key.tab && activeSlashMatch) {
        const prefilled = getReplSlashCommandPrefill(activeSlashMatch.command);
        setState({
          value: prefilled,
          cursor: prefilled.length,
          historyIndex: -1,
          savedInput: state.savedInput,
        });
        setSelectedSlashIndex(0);
        return;
      }

      if (key.return) {
        if (activeSlashMatch) {
          const submitValue = getReplSlashCommandSubmitValue(activeSlashMatch.command);
          if (submitValue == null) {
            const prefilled = getReplSlashCommandPrefill(activeSlashMatch.command);
            setState({
              value: prefilled,
              cursor: prefilled.length,
              historyIndex: -1,
              savedInput: state.savedInput,
            });
            setSelectedSlashIndex(0);
            return;
          }

          setState(createTextInputState());
          setSelectedSlashIndex(0);
          onSubmit(submitValue);
          return;
        }

        const submitted = state.value;
        setState(createTextInputState());
        setSelectedSlashIndex(0);
        onSubmit(submitted);
        return;
      }

      setState((current) => applyTextInputKey(current, input, key, history).state);
      if (
        input ||
        key.backspace ||
        key.delete ||
        key.leftArrow ||
        key.rightArrow ||
        key.home ||
        key.end
      ) {
        setSelectedSlashIndex(0);
      }
    },
    { isActive: active },
  );

  const beforeCursor = state.value.slice(0, state.cursor);
  const hasCharacterAtCursor = state.cursor < state.value.length;
  const cursorCharacter = hasCharacterAtCursor ? state.value[state.cursor] : undefined;
  const afterCursor = hasCharacterAtCursor ? state.value.slice(state.cursor + 1) : "";

  return (
    <Box flexDirection="column">
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

      {slashMatches.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {slashMatches.map((match, index) => {
            const isSelected = index === selectedSlashIndex;
            return (
              <Box key={match.command.command}>
                <Text color={isSelected ? "cyan" : undefined} inverse={isSelected}>
                  {match.command.helpLabel}
                </Text>
                <Text dimColor> {match.command.description}</Text>
              </Box>
            );
          })}
          <Text dimColor>
            {activeSlashMatch?.command.argMode === "none"
              ? "Enter runs the selected slash command."
              : "Tab prefills the selected slash command so you can add input."}
          </Text>
        </Box>
      )}
    </Box>
  );
}
