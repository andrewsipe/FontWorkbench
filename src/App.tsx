import { useEffect } from "react";
import SetupView from "./components/SetupView";
import WorkbenchView from "./components/WorkbenchView";
import { useWorkbenchStore } from "./stores/workbenchStore";
import "./App.css";

function App() {
  const appView = useWorkbenchStore((s) => s.appView);
  const loadProcessedIndex = useWorkbenchStore((s) => s.loadProcessedIndex);

  useEffect(() => {
    loadProcessedIndex();
  }, [loadProcessedIndex]);

  return (
    <div className="app">
      {appView === "setup" && <SetupView />}
      {appView === "workbench" && <WorkbenchView />}
    </div>
  );
}

export default App;
