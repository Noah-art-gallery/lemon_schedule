import Image from "next/image";

export const avatarOptions = [
  { key: "lemon", label: "레몬" },
  { key: "cat", label: "고양이" },
  { key: "dog", label: "강아지" },
  { key: "rabbit", label: "토끼" },
  { key: "bear", label: "곰" },
  { key: "fox", label: "여우" },
  { key: "penguin", label: "펭귄" },
  { key: "flower", label: "튤립" },
] as const;

export function ProfileAvatar({
  avatarKey = "lemon",
  size = 48,
}: {
  avatarKey?: string;
  size?: number;
}) {
  const avatar = avatarOptions.find((option) => option.key === avatarKey) ?? avatarOptions[0];
  return (
    <Image
      src={`/avatars/${avatar.key}.svg`}
      alt={avatar.label}
      width={size}
      height={size}
      unoptimized
      style={{ flexShrink: 0 }}
    />
  );
}
