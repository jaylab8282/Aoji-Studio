import { useParams } from "react-router-dom";

export function WorkflowDetailScreen() {
  const { name } = useParams<{ name: string }>();

  return (
    <main className="px-page-x py-8">
      <h1 className="text-title font-bold text-text">{name}</h1>
    </main>
  );
}
