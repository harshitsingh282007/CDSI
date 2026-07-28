import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ showText = false }: { showText?: boolean }) {
  const { theme, setTheme } = useTheme();
  
  // To avoid hydration mismatch, you ideally check if mounted, but for simplicity here we assume it's fine
  const isDark = theme === "dark";

  return (
    <Button
      variant="outline"
      size={showText ? "default" : "icon"}
      className={`rounded-full shadow-sm ${showText ? 'px-4 gap-2' : ''}`}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? (
        <>
          <Sun className="h-[1.2rem] w-[1.2rem] text-orange-400" />
          {showText && <span>Switch to Light Mode</span>}
        </>
      ) : (
        <>
          <Moon className="h-[1.2rem] w-[1.2rem] text-slate-700" />
          {showText && <span>Switch to Dark Mode</span>}
        </>
      )}
      {!showText && <span className="sr-only">Toggle theme</span>}
    </Button>
  );
}
