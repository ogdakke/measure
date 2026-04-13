import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { applyTextInputKey, createTextInputState } from "./text-input-state.ts";
import { LoadingIndicator } from "./LoadingIndicator.tsx";
import type { ReplSlashCommand } from "../repl/slash-commands.ts";
import {
  getReplSlashCommandMatches,
  getReplSlashCommandHelpLabelPadding,
  getReplSlashCommandPrefill,
  getReplSlashCommandQuery,
  getReplSlashCommandSubmitValue,
  REPL_SLASH_COMMANDS,
} from "../repl/slash-commands.ts";
import type { TextInputState } from "./text-input-state.ts";
import {
  createHistorySearchIndex,
  getInlineHistorySuggestion,
} from "../repl/history-suggestions.ts";

interface TextInputProps {
  prompt: string;
  onSubmit: (value: string) => void;
  onClear?: () => void;
  onNavigateDownBoundary?: () => void;
  onHistorySearchOpen?: () => void;
  active?: boolean;
  history?: string[];
  historySuggestions?: string[];
  historySearchLoading?: boolean;
  slashCommands?: ReplSlashCommand[];
}

interface HistorySearchState {
  draft: TextInputState;
  query: TextInputState;
  selectedIndex: number;
}

const HISTORY_SEARCH_VISIBLE_MATCHES = 8;

export function shouldNavigateSlashMatches(
  historyIndex: number,
  hasSlashMatches: boolean,
  key: { upArrow: boolean; downArrow: boolean },
): boolean {
  return historyIndex === -1 && hasSlashMatches && (key.upArrow || key.downArrow);
}

export function shouldFocusShellsBoundary(
  historyIndex: number,
  value: string,
  hasSlashMatches: boolean,
  key: { downArrow: boolean },
): boolean {
  return key.downArrow && !hasSlashMatches && historyIndex === -1 && value.length === 0;
}

function getVisibleHistorySearchWindow(total: number, selected: number) {
  if (total <= HISTORY_SEARCH_VISIBLE_MATCHES) {
    return { start: 0, end: total };
  }

  const safeSelected = Math.min(Math.max(selected, 0), total - 1);
  const halfWindow = Math.floor(HISTORY_SEARCH_VISIBLE_MATCHES / 2);
  const start = Math.min(
    Math.max(safeSelected - halfWindow, 0),
    total - HISTORY_SEARCH_VISIBLE_MATCHES,
  );

  return {
    start,
    end: start + HISTORY_SEARCH_VISIBLE_MATCHES,
  };
}

function renderHighlightedHistoryMatch(value: string, positions: Set<number>, isSelected: boolean) {
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)]
    .map((segment) => segment.segment);

  return graphemes.map((char, index) => (
    <Text
      key={`history-match-char-${index}`}
      bold={positions.has(index)}
      color={positions.has(index) && !isSelected ? "cyan" : undefined}
    >
      {char}
    </Text>
  ));
}

export function TextInput({
  prompt,
  onSubmit,
  onClear,
  onNavigateDownBoundary,
  onHistorySearchOpen,
  active = true,
  history = [],
  historySuggestions = [],
  historySearchLoading = false,
  slashCommands = [],
}: TextInputProps) {
  const [state, setState] = useState(createTextInputState);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [historySearch, setHistorySearch] = useState<HistorySearchState | null>(null);
  const stateRef = useRef(state);
  const historySearchRef = useRef(historySearch);
  const selectedSlashIndexRef = useRef(selectedSlashIndex);
  const slashQuery = getReplSlashCommandQuery(state.value);
  const slashMatches =
    slashQuery == null || slashCommands.length === 0
      ? []
      : getReplSlashCommandMatches(slashQuery, slashCommands);
  const activeSlashMatch = slashMatches[selectedSlashIndex] ?? slashMatches[0];
  const slashHelpLabelCommands = slashCommands.length > 0 ? slashCommands : REPL_SLASH_COMMANDS;
  const historySearchIndex = useMemo(
    () => createHistorySearchIndex(historySuggestions),
    [historySuggestions],
  );
  const historySearchQuery = historySearch?.query.value ?? "";
  const historySearchResults = useMemo(
    () => (historySearch == null ? [] : historySearchIndex.find(historySearchQuery)),
    [historySearch, historySearchIndex, historySearchQuery],
  );
  const historySearchMatches = useMemo(
    () => historySearchResults.map((match) => match.value),
    [historySearchResults],
  );
  const inlineSuggestion = useMemo(
    () =>
      historySearch == null && slashMatches.length === 0
        ? getInlineHistorySuggestion(state.value, state.cursor, historySuggestions)
        : null,
    [historySearch, historySuggestions, slashMatches.length, state.cursor, state.value],
  );
  const visibleHistorySearchWindow = useMemo(
    () => getVisibleHistorySearchWindow(historySearchMatches.length, historySearch?.selectedIndex ?? 0),
    [historySearch?.selectedIndex, historySearchMatches.length],
  );
  const visibleHistorySearchResults = useMemo(
    () =>
      historySearchResults.slice(visibleHistorySearchWindow.start, visibleHistorySearchWindow.end),
    [historySearchResults, visibleHistorySearchWindow.end, visibleHistorySearchWindow.start],
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    historySearchRef.current = historySearch;
  }, [historySearch]);

  useEffect(() => {
    selectedSlashIndexRef.current = selectedSlashIndex;
  }, [selectedSlashIndex]);

  useEffect(() => {
    if (slashMatches.length === 0) {
      setSelectedSlashIndex(0);
      return;
    }

    setSelectedSlashIndex((current) => Math.min(current, slashMatches.length - 1));
  }, [slashMatches.length]);

  useEffect(() => {
    if (historySearch == null) {
      return;
    }

    setHistorySearch((current) => {
      if (current == null) {
        return current;
      }

      if (historySearchMatches.length === 0) {
        return current.selectedIndex === 0 ? current : { ...current, selectedIndex: 0 };
      }

      const nextSelectedIndex = Math.min(current.selectedIndex, historySearchMatches.length - 1);
      if (nextSelectedIndex === current.selectedIndex) {
        return current;
      }

      return {
        ...current,
        selectedIndex: nextSelectedIndex,
      };
    });
  }, [historySearch, historySearchMatches.length]);

  const closeHistorySearch = () => {
    if (historySearch == null) {
      return;
    }

    setState(historySearch.draft);
    setHistorySearch(null);
  };

  useInput(
    (input, key) => {
      const currentState = stateRef.current;
      const currentHistorySearch = historySearchRef.current;
      const currentSelectedSlashIndex = selectedSlashIndexRef.current;
      const currentActiveSlashMatch = slashMatches[currentSelectedSlashIndex] ?? slashMatches[0];
      const currentActiveHistorySearchMatch =
        currentHistorySearch == null
          ? null
          : (historySearchResults[currentHistorySearch.selectedIndex] ?? historySearchResults[0] ?? null);
      const currentInlineSuggestion =
        currentHistorySearch == null && slashMatches.length === 0
          ? getInlineHistorySuggestion(
              currentState.value,
              currentState.cursor,
              historySuggestions,
            )
          : null;

      if (key.ctrl && input === "r") {
        if (currentHistorySearch != null) {
          if (historySearchMatches.length > 0) {
            setHistorySearch((current) =>
              current == null
                ? null
                : {
                    ...current,
                    selectedIndex: Math.min(
                      current.selectedIndex + 1,
                      historySearchMatches.length - 1,
                    ),
                  },
            );
          }
          return;
        }

        onHistorySearchOpen?.();
        setHistorySearch({
          draft: currentState,
          query: createTextInputState(),
          selectedIndex: 0,
        });
        return;
      }

      if (currentHistorySearch != null) {
        if (key.escape) {
          closeHistorySearch();
          return;
        }

        if (key.upArrow) {
          setHistorySearch((current) =>
            current == null || historySearchMatches.length === 0
              ? current
              : {
                  ...current,
                  selectedIndex: Math.max(current.selectedIndex - 1, 0),
                },
          );
          return;
        }

        if (key.downArrow) {
          setHistorySearch((current) =>
            current == null
              ? null
              : {
                  ...current,
                  selectedIndex:
                    historySearchMatches.length === 0
                      ? 0
                      : Math.min(current.selectedIndex + 1, historySearchMatches.length - 1),
                },
          );
          return;
        }

        if (key.return || key.tab) {
          if (!currentActiveHistorySearchMatch) {
            return;
          }

          setState({
            value: currentActiveHistorySearchMatch.value,
            cursor: currentActiveHistorySearchMatch.value.length,
            historyIndex: -1,
            savedInput: currentHistorySearch.draft.savedInput,
          });
          setHistorySearch(null);
          return;
        }

        const result = applyTextInputKey(currentHistorySearch.query, input, key, []);
        if (result.clearScreen) {
          onClear?.();
        }

        setHistorySearch((current) =>
          current == null
            ? null
            : {
                ...current,
                query: result.state,
                selectedIndex: 0,
              },
        );
        return;
      }

      if (shouldNavigateSlashMatches(currentState.historyIndex, slashMatches.length > 0, key)) {
        setSelectedSlashIndex((current) => {
          if (key.upArrow) {
            return current <= 0 ? slashMatches.length - 1 : current - 1;
          }

          return current >= slashMatches.length - 1 ? 0 : current + 1;
        });
        return;
      }

      if (key.tab && currentActiveSlashMatch) {
        const prefilled = getReplSlashCommandPrefill(currentActiveSlashMatch.command);
        setState({
          value: prefilled,
          cursor: prefilled.length,
          historyIndex: -1,
          savedInput: currentState.savedInput,
        });
        setSelectedSlashIndex(0);
        return;
      }

      if (currentInlineSuggestion && ((key.rightArrow && !key.ctrl && !key.meta) || key.tab)) {
        setState({
          value: currentInlineSuggestion,
          cursor: currentInlineSuggestion.length,
          historyIndex: -1,
          savedInput: currentState.savedInput,
        });
        setSelectedSlashIndex(0);
        return;
      }

      if (key.return) {
        if (currentActiveSlashMatch) {
          const submitValue = getReplSlashCommandSubmitValue(currentActiveSlashMatch.command);
          if (submitValue == null) {
            const prefilled = getReplSlashCommandPrefill(currentActiveSlashMatch.command);
            setState({
              value: prefilled,
              cursor: prefilled.length,
              historyIndex: -1,
              savedInput: currentState.savedInput,
            });
            setSelectedSlashIndex(0);
            return;
          }

          setState(createTextInputState());
          setSelectedSlashIndex(0);
          onSubmit(submitValue);
          return;
        }

        const submitted = currentState.value;
        setState(createTextInputState());
        setSelectedSlashIndex(0);
        onSubmit(submitted);
        return;
      }

      if (
        shouldFocusShellsBoundary(
          currentState.historyIndex,
          currentState.value,
          currentActiveSlashMatch != null,
          key,
        )
      ) {
        onNavigateDownBoundary?.();
        return;
      }

      const result = applyTextInputKey(currentState, input, key, history);
      if (result.submit !== undefined) {
        setState(result.state);
        setSelectedSlashIndex(0);
        onSubmit(result.submit);
        return;
      }

      if (result.clearScreen) {
        setState(result.state);
        setSelectedSlashIndex(0);
        onClear?.();
        return;
      }

      setState(result.state);
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

  const activeInputState = historySearch?.query ?? state;
  const activePrompt = historySearch == null ? prompt : "history > ";
  const beforeCursor = activeInputState.value.slice(0, activeInputState.cursor);
  const hasCharacterAtCursor = activeInputState.cursor < activeInputState.value.length;
  const cursorCharacter = hasCharacterAtCursor
    ? activeInputState.value[activeInputState.cursor]
    : undefined;
  const afterCursor = hasCharacterAtCursor
    ? activeInputState.value.slice(activeInputState.cursor + 1)
    : "";
  const inlineSuggestionSuffix =
    historySearch == null && inlineSuggestion ? inlineSuggestion.slice(state.value.length) : null;

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>{activePrompt}</Text>
        <Text>{beforeCursor}</Text>
        {active && hasCharacterAtCursor && cursorCharacter !== undefined ? (
          <Text inverse>{cursorCharacter}</Text>
        ) : (
          <Text>{hasCharacterAtCursor ? cursorCharacter : ""}</Text>
        )}
        <Text>{afterCursor}</Text>
        {active && !hasCharacterAtCursor && <Text color="gray">█</Text>}
        {historySearch == null && inlineSuggestionSuffix ? (
          <Text dimColor>{inlineSuggestionSuffix}</Text>
        ) : null}
      </Box>

      {historySearch != null && (
        <Box flexDirection="column" marginLeft={2}>
          {historySearchMatches.length > 0 ? (
            visibleHistorySearchResults.map((match, index) => {
              const matchIndex = visibleHistorySearchWindow.start + index;
              const isSelected = matchIndex === historySearch.selectedIndex;
              return (
                <Text
                  key={`history-search-${matchIndex}-${match.value}`}
                  color={isSelected ? "cyan" : undefined}
                  inverse={isSelected}
                >
                  {renderHighlightedHistoryMatch(match.value, match.positions, isSelected)}
                </Text>
              );
            })
          ) : (
            <Text dimColor>No history matches yet.</Text>
          )}
          {historySearchMatches.length > 0 && (
            <Text dimColor>
              {historySearch.selectedIndex + 1}/{historySearchMatches.length}
              {visibleHistorySearchResults.length < historySearchMatches.length
                ? ` · showing ${visibleHistorySearchWindow.start + 1}-${visibleHistorySearchWindow.end}`
                : ""}
            </Text>
          )}
          {historySearchLoading && <LoadingIndicator label="Loading shell history..." />}
          <Text dimColor>Enter/Tab inserts · Ctrl+R/Up/Down moves · Esc cancels</Text>
        </Box>
      )}

      {historySearch == null && slashMatches.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {slashMatches.map((match, index) => {
            const isSelected = index === selectedSlashIndex;
            const helpLabelPadding = getReplSlashCommandHelpLabelPadding(
              match.command.helpLabel,
              slashHelpLabelCommands,
            );
            return (
              <Box key={match.command.command}>
                <Text color={isSelected ? "cyan" : undefined} inverse={isSelected}>
                  {match.command.helpLabel}
                </Text>
                <Text>{helpLabelPadding}</Text>
                <Text dimColor>{match.command.description}</Text>
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
