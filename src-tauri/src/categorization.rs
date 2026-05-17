use crate::ai::client::OllamaClient;
use crate::ai::tasks;
use crate::error::Result;

pub async fn suggest_category(
    client: &OllamaClient,
    model: &str,
    conversation: &str,
) -> Result<Option<String>> {
    tasks::suggest_category(client, model, conversation).await
}
