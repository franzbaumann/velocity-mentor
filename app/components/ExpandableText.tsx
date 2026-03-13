import { FC, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
};

export const ExpandableText: FC<Props> = ({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(Boolean(value));
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  if (!open) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setOpen(true)}
        style={styles.linkRow}
      >
        <Text style={[styles.linkText, { color: colors.primary }]}>{label}</Text>
        <Text style={[styles.linkText, { color: colors.primary }]}>→</Text>
      </TouchableOpacity>
    );
  }

  const minHeight = rows * 24;

  return (
    <View>
      <TextInput
        ref={inputRef}
        style={[
          styles.textArea,
          {
            minHeight,
            borderColor: colors.border,
            color: colors.foreground,
          },
        ]}
        multiline
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        textAlignVertical="top"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  linkText: {
    fontSize: 13,
    fontWeight: "500",
  },
  textArea: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
});

