import { Layout } from "@/Layout";
import routes from "@/routes";
import { useEffect } from "react";
import { AppStoreState, useAppStore } from "@/hooks/use-store.ts";
import { ThemeProvider } from "@/components/theme-provider"

const App = (): React.ReactElement => {
    const loadStatus = useAppStore((state: AppStoreState) => state.loadStatus);
    const loadSettings = useAppStore((state: AppStoreState) => state.loadSettings);

    useEffect(() => {
        loadStatus();
        loadSettings();
    }, [])

    return (
        <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
            <Layout>{routes}</Layout>
        </ThemeProvider>
    )
};

export default App;
