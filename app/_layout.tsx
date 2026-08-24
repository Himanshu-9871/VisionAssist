import { Stack } from "expo-router";

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

//this is used to set up the navigation stack for the app, and it hides the header for all screens in the stack.
