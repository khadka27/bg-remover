import ImageProcessor from "@/components/ImageProcessor";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
              Image Background Remover
            </h1>
            <p className="text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              Upload any image and instantly remove the background with our
              AI-powered tool. No registration required, and your privacy is
              guaranteed.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden">
            <div className="p-6 md:p-8">
              <ImageProcessor />
            </div>
          </div>

          <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 text-center space-y-2">
            <h3 className="font-medium text-slate-800 dark:text-slate-200">
              Your Privacy Matters
            </h3>
            <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <p>
                All processing happens in your browser and on secure servers.
              </p>
              <p>
                Your images are not stored and are automatically deleted after
                processing.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
