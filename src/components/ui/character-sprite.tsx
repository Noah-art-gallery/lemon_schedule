// Source rectangles include a two-pixel guard around each transparent silhouette.
// Normalize the art into the same square viewport without stretching the source.
const spriteBounds = {
  "avatar-lemon": [56, 58, 222, 241],
  "avatar-cat": [349, 85, 243, 215],
  "avatar-dog": [644, 108, 275, 190],
  "avatar-rabbit": [982, 46, 218, 255],
  "avatar-bear": [49, 360, 231, 215],
  "avatar-fox": [348, 358, 245, 217],
  "avatar-penguin": [666, 377, 239, 199],
  "avatar-flower": [995, 367, 192, 224],
  "reaction-lemon": [38, 643, 268, 245],
  "reaction-clap": [364, 643, 234, 246],
  "reaction-heart": [673, 642, 201, 248],
  "reaction-cheer": [947, 643, 294, 243],
  "pet-default": [57, 938, 203, 253],
  "pet-rest": [344, 950, 243, 245],
  "pet-wave": [677, 940, 227, 253],
  "pet-celebrate": [963, 941, 248, 248],
} as const;

export function CharacterSprite({
  name,
  alt = "",
  size = 48,
  className,
}: {
  name: keyof typeof spriteBounds;
  alt?: string;
  size?: number;
  className?: string;
}) {
  const [x, y, sourceWidth, sourceHeight] = spriteBounds[name];
  const scale = 432 / Math.max(sourceWidth, sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      focusable="false"
      data-sprite={name}
      className={className}
      style={{ display: "block", flexShrink: 0 }}
    >
      <svg
        x={(512 - width) / 2}
        y={(512 - height) / 2}
        width={width}
        height={height}
        viewBox={`${x} ${y} ${sourceWidth} ${sourceHeight}`}
        overflow="hidden"
      >
        <image href="/sprites/characters-v1.png" width={1254} height={1254} />
      </svg>
    </svg>
  );
}
