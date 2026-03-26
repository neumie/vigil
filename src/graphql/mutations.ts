export const CREATE_COMMENT = `
mutation CreateComment($taskId: String!, $contentData: Json!, $isPublic: Boolean!) {
  createComment(data: {
    task: { connect: { id: $taskId } }
    isPublic: $isPublic
    sourceType: ai_generated
    content: { create: { data: $contentData } }
  }) {
    ok
    node { id }
  }
}
`
