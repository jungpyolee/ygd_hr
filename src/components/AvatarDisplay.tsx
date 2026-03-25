"use client";

import ReactNiceAvatar, { genConfig, AvatarFullConfig } from "react-nice-avatar";

interface AvatarDisplayProps {
  userId: string;
  avatarConfig?: AvatarFullConfig | null;
  size?: number;
}

export default function AvatarDisplay({ userId, avatarConfig, size = 56 }: AvatarDisplayProps) {
  const config = avatarConfig ?? genConfig(userId);
  return (
    <ReactNiceAvatar
      style={{ width: size, height: size, flexShrink: 0 }}
      {...config}
    />
  );
}
