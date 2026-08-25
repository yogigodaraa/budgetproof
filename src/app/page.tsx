import Dashboard from "@/components/Dashboard";
import { loadDataset } from "@/lib/data";

export const dynamic = "force-static";

export default function Home() {
  const ds = loadDataset();
  return <Dashboard ds={ds} />;
}
