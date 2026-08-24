import { View, Text, StyleSheet } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>VisionAssist</Text>

      <Text style={styles.subtitle}>
        Assistive vision application for visually impaired users
      </Text>
    </View>
  );
}
//this will be the home screen of the app, it will have a title and a subtitle, and will be centered on the screen.

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },

  title: {
    fontSize: 32,
    fontWeight: "bold",
  },

  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginTop: 12,
  },
});