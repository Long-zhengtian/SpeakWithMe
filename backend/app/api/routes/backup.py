from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.api.deps import get_container
from app.api.schemas import BackupImportResult
from app.container import apply_stored_llm
from app.domain.backup import export_backup, import_backup

router = APIRouter()


@router.get("/backup")
def download_backup(container=Depends(get_container)):
    body = export_backup(container.repository)
    return JSONResponse(
        content=body,
        headers={"Content-Disposition": 'attachment; filename="speak-with-me-backup.json"'},
    )


@router.post("/backup", response_model=BackupImportResult)
def upload_backup(payload: dict, container=Depends(get_container)):
    result = import_backup(container.repository, payload)
    if result["settings"]:
        apply_stored_llm(container)
    return BackupImportResult(**result)
