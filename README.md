# empty-bucket

A simple utility to empty an S3 bucket so that the bucket can be deleted by an Ansible task.

To implement a sophisticated infrastructure-as-code concept, the entire technology stack running at AWS needs to be
provisioned and tore down from time to time. In the case that an S3 bucket contains any object, the deletion will fail.
Things can be more tricky if the bucket is versioning-enabled or contains millions of objects.

This utility "hard" deletes all the objects in the specified bucket to make it really empty. Because it is intended to be
used in shell scripts, there intentionally has no confirmation or interaction needed. Use with caution!

## Install

```npm install -g empty-bucket```

## Run

```empty-bucket [options] <bucket-name>```

```bucket-name``` is just the name, not the ARN, not a name with `s3://` prefix. 

*Options*
```
  --help                    Show this help message
  -v, --verbose             Display verbose messages for troubleshooting
  -q, --quite               Display nothing but critical error messages
  -r, --region              AWS region
                 
```
