import { MaterialIconButton } from "@/components/buttons/icon-button";
import { useSystem } from "@/context";
import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Pressable,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

interface DropdownItem<T> {
  label: string | React.ReactNode;
  selectedLabel?: string | React.ReactNode;
  value: T;
}

interface DropdownProps<T> {
  items: DropdownItem<T>[];
  selectedValue: T;
  onValueChange: (value: T) => void;
  equalityFn?: (a: T, b: T) => boolean;
}

function Dropdown<T>({
  items,
  selectedValue,
  onValueChange,
  equalityFn,
}: DropdownProps<T>) {
  const { colorScheme } = useSystem();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSelected = (item: DropdownItem<T>) => equalityFn ? equalityFn(item.value, selectedValue) : item.value == selectedValue;
  const selectedItem = items.find(isSelected) ?? items[0];
  const selectedLabel = selectedItem?.selectedLabel ?? selectedItem?.label;
  const searchable = items.length > 8 && items.every(item => typeof item.label === "string");
  const visibleItems = searchable ? items.filter(item => String(item.label).toLowerCase().includes(query.trim().toLowerCase())) : items;
  const openMenu = () => { setQuery(""); setOpen(true); };
  const closeMenu = () => setOpen(false);

  const styles = StyleSheet.create({
    rootWrapper: {
      alignSelf: "stretch",
    },
    root: {
      flexDirection: "row",
      alignItems: "center",
    },
    label: {
      color: colorScheme.onSurface,
      fontSize: 14,
      flexShrink: 1,
      maxWidth: 200,
    },
    caret: { 
      paddingHorizontal: 6, 
      paddingVertical: 2 
    },
    overlay: {
      flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center", alignItems: "center",
      paddingTop: insets.top, paddingBottom: insets.bottom,
    },
    popover: {
      width: Math.max(0, Math.min(420, width - insets.left - insets.right - 32)),
      maxHeight: Math.max(0, Math.min(560, height - insets.top - insets.bottom - 32)),
      backgroundColor: colorScheme.surfaceVariant,
      borderRadius: 16, padding: 12,
    },
    search: { color: colorScheme.onSurface, borderColor: colorScheme.outlineVariant, borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8 },
    itemBtn: { 
      paddingVertical: 10, 
      paddingHorizontal: 12 
    },
    itemText: { 
      color: colorScheme.onSurface, 
      fontSize: 14 
    },
  });

  const Popover = (
    <Modal transparent visible={open} animationType="fade" onRequestClose={closeMenu} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} accessibilityLabel="Close" />
        <View style={styles.popover} accessibilityViewIsModal>
          {searchable && <TextInput style={styles.search} value={query} onChangeText={setQuery} placeholder="🔍" placeholderTextColor={colorScheme.onSurface} accessibilityLabel="Search options" />}
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator persistentScrollbar keyboardShouldPersistTaps="handled">
            {visibleItems.map((item, idx) => (
              <TouchableOpacity key={idx} accessibilityRole="button" accessibilityState={{ selected: isSelected(item) }}
                style={[styles.itemBtn, isSelected(item) && { backgroundColor: colorScheme.primaryContainer, borderRadius: 8 }]}
                onPress={() => { onValueChange(item.value); closeMenu(); }}>
                {typeof item.label === "string" ? <Text style={[styles.itemText, isSelected(item) && { color: colorScheme.onPrimaryContainer }]}>{item.label}{isSelected(item) ? "  ✓" : ""}</Text> : item.label}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.rootWrapper} collapsable={false}>
      <View style={styles.root}>
        {typeof selectedLabel === "string" ? (
          <Text style={styles.label} numberOfLines={1}>
            {selectedLabel}
          </Text>
        ) : (
          selectedLabel
        )}
        <MaterialIconButton
          icon={open ? "arrow-drop-up" : "arrow-drop-down"}
          size={30}
          style={styles.caret}
          onPress={openMenu}
        />
      </View>
      {open && Popover}
    </View>
  );
}

export default Dropdown;