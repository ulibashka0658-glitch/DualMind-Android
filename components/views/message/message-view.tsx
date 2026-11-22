import MessageContentView from "@/components/views/message/content-view";
import MessageControlsView from "@/components/views/message/controls-view";
import MessageRoleView from "@/components/views/message/role-view";
import { TokenUsageDetails } from "@/components/TokenUsageDetails";
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
      {message.role === "assistant" && usageData ? (
        <TokenUsageDetails
          usage={usageData.usage}
          mode={usageData.mode}
          pricing={usageData.pricing}
          fx={usageData.fx}
          expanded={expanded}
          onToggle={() => setExpanded(value => !value)}
        />
      ) : null}
    </View>
  );
}

export default MessageView;
