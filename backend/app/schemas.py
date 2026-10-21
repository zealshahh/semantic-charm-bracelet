from pydantic import BaseModel, Field, field_validator


class GenerateRequest(BaseModel):
    memory: str = Field(max_length=400)
    charm_count: int = Field(5, ge=3, le=7)

    @field_validator("memory")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("memory must not be blank")
        return v


class Physics(BaseModel):
    density: float = 0.001
    friction: float = 0.3
    restitution: float = 0.2


class CharmOut(BaseModel):
    id: str
    name: str
    concept: str
    asset_url: str
    match_score: float  # cosine similarity, NOT a probability
    position: int
    physics: Physics


class BraceletOut(BaseModel):
    success: bool = True
    bracelet_id: str
    theme: str
    charms: list[CharmOut]
