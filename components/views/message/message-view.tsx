import MessageContentView from "@/components/views/message/content-view";
import MessageControlsView from "@/components/views/message/controls-view";
import MessageRoleView from "@/components/views/message/role-view";
import { TokenUsageDetails } from "@/components/TokenUsageDetails";
import { readMessageUsage } from "@/lib/message-usage";
import type { FxRate, TokenPricing, TokenUsage } from "@/lib/token-usage";
import { MessageNode } from "message-nodes";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

export type MessageUsageData = {
  usage: TokenUsage;
  mode: 'local' | 'cloud';
  pricing: TokenPricing | null;
  fx: FxRate | null;
};

function MessageView({
  message,
  usageData,
}: {
  message: MessageNode;
  /** Only supply verified or explicitly estimated usage for this message. */
  usageData?: MessageUsageData | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleUsage = usageData ?? readMessageUsage(message.metadata);
  const styles = StyleSheet.create({
    view: {
      flexDirection: "column",
      alignItems: "flex-start",
      marginVertical: 12,
      marginHorizontal: 4,
    },
    mainRow: {
      flexDirection: "row",
      marginBottom: 8,
      justifyContent: "space-between",
      width: "100%",
    },
  });

  return (
    <View style={styles.view}>
      <View style={styles.mainRow}>
        <MessageRoleView message={message} />
        <MessageControlsView message={message} />
      </View>
      <MessageContentView message={message} />
      {message.role === "assistant" && visibleUsage ? (
        <TokenUsageDetails
          usage={visibleUsage.usage}
          mode={visibleUsage.mode}
          pricing={visibleUsage.pricing}
          fx={visibleUsage.fx}
          expanded={expanded}
          onToggle={() => setExpanded(value => !value)}
        />
      ) : null}
    </View>
  );
}

export default MessageView;
