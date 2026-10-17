import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Field } from "@/components/ui/field";

describe("Field", () => {
  it("keeps the validation error connected when the caller supplies another description", () => {
    render(
      <>
        <p id="name-context">친구에게 표시되는 이름</p>
        <Field
          label="닉네임"
          error="닉네임을 입력해 주세요"
          aria-describedby="name-context"
          aria-invalid={false}
        />
      </>,
    );

    const input = screen.getByRole("textbox", { name: "닉네임" });
    expect(input).toHaveAccessibleDescription("친구에게 표시되는 이름 닉네임을 입력해 주세요");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("닉네임을 입력해 주세요");
  });

  it("removes the validation error after recovery while keeping the hint and external description", () => {
    const { rerender } = render(<Field label="닉네임" error="닉네임을 입력해 주세요" />);
    rerender(
      <>
        <p id="name-context">친구에게 표시되는 이름</p>
        <Field label="닉네임" hint="40자까지 입력" aria-describedby="name-context" />
      </>,
    );

    const input = screen.getByRole("textbox", { name: "닉네임" });
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).toHaveAccessibleDescription("친구에게 표시되는 이름 40자까지 입력");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
