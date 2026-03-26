export const LIST_NEW_TASKS = `
query ListNewTasks($projectSlug: String!, $createdAfter: DateTime!) {
  listTask(
    filter: {
      project: { slug: { eq: $projectSlug } }
      createdAt: { gte: $createdAfter }
      archivedAt: { isNull: true }
    }
    orderBy: [{ createdAt: asc }]
    limit: 50
  ) {
    id
    title
    status
    priority
    createdAt
    dueDate
    timeEstimate
    module { name }
    project {
      id
      slug
      name
      repositoryUrl
      aiMode
    }
  }
}
`

export const GET_TASK_CONTEXT = `
query GetTaskContext($taskId: String!) {
  getTask(by: { id: $taskId }) {
    id
    title
    status
    priority
    dueDate
    timeEstimate
    module { name }
    description {
      data
      references {
        file { url fileName fileType }
      }
    }
    comments(
      filter: { deletedAt: { isNull: true } }
      orderBy: [{ createdAt: asc }]
    ) {
      id
      createdAt
      sourceType
      isPublic
      content { data }
      person {
        tenantPerson { name email }
      }
    }
    project {
      id
      name
      slug
      repositoryUrl
      aiMode
      description { data }
      contexts(orderBy: [{ updatedAt: desc }]) {
        title
        markdown
      }
    }
  }
}
`
