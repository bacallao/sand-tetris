import SandTetrisDebug from "../components/SandTetrisDebug";

export default function Page() {
  return (
    <div className="min-h-screen bg-gray-900 p-8">
      {/* Sand Tetris Physics Debug */}
      <div className="mt-16">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">
            Sand Tetris Physics Debug
          </h2>
          <p className="text-gray-400">
            Step-by-step cellular automata testing
          </p>
        </div>
        <SandTetrisDebug
          width={50}
          height={90}
          cellSize={5}
          className="mx-auto"
        />
      </div>
    </div>
  );
}
