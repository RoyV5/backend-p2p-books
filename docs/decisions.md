External Metadata reconciliation V1
    When OpenLibrary and Google Books return consistent records for an ISBN, the application may combine their metadata. When they disagree materially, the application will not merge the records. OpenLibrary will be treated as the preferred source, and missing metadata will be accepted rather than filled using potentially incorrect information from the conflicting record.

    NB: Discrepancies should eventually be recorded so their frequency can be measured before deciding whether automated reconciliation or manual administrative resolution is warranted.

    