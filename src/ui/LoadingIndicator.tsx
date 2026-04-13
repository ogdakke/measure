import { Box, Text } from "ink";
import Spinner from "ink-spinner";

interface LoadingIndicatorProps {
  label?: string;
  color?: string;
}

export function LoadingIndicator({
  label,
  color = "cyan",
}: LoadingIndicatorProps) {
  return (
    <Box>
      <Text color={color}>
        <Spinner type="dots" />
      </Text>
      {label && (
        <>
          <Text> </Text>
          <Text dimColor>{label}</Text>
        </>
      )}
    </Box>
  );
}
