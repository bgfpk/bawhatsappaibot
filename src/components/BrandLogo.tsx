import logoForLightSurfaces from "../../media/black-arrow-logo-light.png";
import logoForDarkSurfaces from "../../media/black-arrow-logo-dark.png";

type BrandLogoProps = {
  isDarkMode?: boolean;
  className?: string;
  imageClassName?: string;
  alt?: string;
};

export function BrandLogo({
  isDarkMode,
  className = "",
  imageClassName = "h-10 w-auto",
  alt = "Black Arrow",
}: BrandLogoProps) {
  const isDark =
    typeof isDarkMode === "boolean"
      ? isDarkMode
      : typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark"
      : false;

  const logoSrc = isDark ? logoForDarkSurfaces : logoForLightSurfaces;

  return (
    <div className={className}>
      <img src={logoSrc} alt={alt} className={imageClassName} />
    </div>
  );
}
