import { useEffect } from "react";
import SetupView from "./components/SetupView";
import WorkbenchView from "./components/WorkbenchView";
import { useWorkbenchStore } from "./stores/workbenchStore";
import "./App.css";
import "./styles/workbench-theme.css";

function App() {
  const appView = useWorkbenchStore((s) => s.appView);
  const restoreProcessedHandle = useWorkbenchStore((s) => s.restoreProcessedHandle);

  useEffect(() => {
    restoreProcessedHandle();
  }, [restoreProcessedHandle]);

  return (
    <div className={`app ${appView === "setup" ? "theme-workbench" : ""}`}>
      {appView === "setup" && <SetupView />}
      {appView === "workbench" && <WorkbenchView />}
    </div>
  );
}

export default App;
