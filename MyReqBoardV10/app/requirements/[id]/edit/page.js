"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import RequirementForm from "../../RequirementForm";

export default function EditRequirementPage() {
  const { id } = useParams();
  const [initial, setInitial] = useState(null);

  useEffect(() => {
    fetch(`/api/requirements/${id}`)
      .then((res) => res.json())
      .then((data) =>
        setInitial({
          code: data.code,
          title: data.title,
          description: data.description || "",
          category: data.category || "",
          priority: data.priority,
          status: data.status,
        })
      );
  }, [id]);

  if (!initial) return <p>로딩 중...</p>;

  return (
    <div>
      <h2>요구사항 수정</h2>
      <RequirementForm initial={initial} requirementId={id} />
    </div>
  );
}
