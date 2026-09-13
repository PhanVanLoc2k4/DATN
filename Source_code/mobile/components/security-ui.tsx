import React from 'react';
import { 
  TouchableOpacity, 
  Text, 
  TextInput, 
  StyleSheet, 
  View, 
  ViewStyle, 
  StyleProp, 
  ActivityIndicator 
} from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Colors } from '@/constants/theme';

interface ButtonProps {
  onPress: () => void;
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SecurityButton({ 
  onPress, 
  title, 
  variant = 'primary', 
  loading = false, 
  style 
}: ButtonProps) {
  const primaryColor = useThemeColor({}, 'tint');
  const dangerColor = useThemeColor({}, 'danger');
  const cardColor = useThemeColor({}, 'card');
  const textColor = useThemeColor({}, 'text');

  const getVariantStyle = () => {
    switch (variant) {
      case 'danger': return { backgroundColor: dangerColor };
      case 'secondary': return { backgroundColor: cardColor, borderWidth: 1, borderColor: Colors.dark.border };
      case 'ghost': return { backgroundColor: 'transparent' };
      default: return { backgroundColor: primaryColor };
    }
  };

  const getTextColor = () => {
    if (variant === 'secondary' || variant === 'ghost') return textColor;
    return '#FFFFFF';
  };

  return (
    <TouchableOpacity 
      onPress={onPress} 
      style={[styles.button, getVariantStyle(), style]} 
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} />
      ) : (
        <Text style={[styles.buttonText, { color: getTextColor() }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

interface InputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SecurityInput({ 
  value, 
  onChangeText, 
  placeholder, 
  secureTextEntry, 
  icon,
  style 
}: InputProps) {
  const backgroundColor = useThemeColor({}, 'card');
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');

  return (
    <View style={[styles.inputContainer, { backgroundColor, borderColor }, style]}>
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(148, 163, 184, 0.5)"
        secureTextEntry={secureTextEntry}
        style={[styles.input, { color: textColor }]}
      />
    </View>
  );
}

export function SecurityCard({ children, style, variant = 'default' }: { children: React.ReactNode, style?: StyleProp<ViewStyle>, variant?: 'default' | 'danger' }) {
  const backgroundColor = useThemeColor({}, 'card');
  const borderColor = useThemeColor({}, variant === 'danger' ? 'danger' : 'border');

  return (
    <View style={[styles.card, { backgroundColor, borderColor, borderLeftWidth: variant === 'danger' ? 4 : 1 }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  inputContainer: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  iconContainer: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
});
